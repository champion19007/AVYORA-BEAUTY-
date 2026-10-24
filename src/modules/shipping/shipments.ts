import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { emitEvent } from '@/lib/events';
import { restoreOrderStock } from '@/lib/orders';
import { getVariant } from '@/lib/catalogue';
import { recordAudit } from '@/modules/audit/audit';
import { applyPaymentSignal } from '@/modules/payments/payment-service';
import { reportError } from '@/lib/observability';
import {
  bookShipment,
  canAdvance,
  getShiprocketConfig,
  trackingEffect,
  type BookedShipment,
  type ShiprocketConfig,
  type TrackingUpdate,
} from './shiprocket';

/**
 * Shipments on orders: booking a courier from the dispatch screen, and
 * applying the courier's tracking updates.
 *
 * The order's status is the single thing the customer and staff read, so the
 * courier moves it (forward only) rather than staff pressing buttons for every
 * leg. Staff buttons still work for parcels sent some other way.
 */

export type BookCourierResult = { ok: true; awb: string } | { ok: false; error: string };

/** Marker written while a booking is in flight, so a double click cannot book twice. */
const BOOKING = { booking: true } as const;

export async function bookCourier(
  orderNumber: string,
  actor: { username: string; role: string },
  options: { config?: ShiprocketConfig | null; fetchImpl?: typeof fetch } = {}
): Promise<BookCourierResult> {
  const config = options.config === undefined ? getShiprocketConfig() : options.config;
  if (!config) return { ok: false, error: 'Shiprocket is not connected yet. Ask the owner to add its login.' };

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.status !== 'fulfilled') return { ok: false, error: 'Mark the order packed before booking a courier.' };
  if (order.awb) return { ok: false, error: `Already booked: ${order.awb}.` };
  const cod = order.paymentProvider === 'cod';
  if (order.attentionReason || order.fraudStatus !== 'approved' || (!cod && order.paymentStatus !== 'paid')) {
    return { ok: false, error: 'This order is on hold. The owner needs to clear it first.' };
  }

  // Claim the booking: exactly one caller moves `shipment` from null.
  const claimed = await db
    .update(orders)
    .set({ shipment: BOOKING })
    .where(and(eq(orders.id, order.id), isNull(orders.shipment)))
    .returning({ id: orders.id });
  if (claimed.length === 0) return { ok: false, error: 'A booking for this order is already in progress.' };

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const address = (order.shippingAddress ?? {}) as Record<string, string>;
  const result = await bookShipment(
    {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      email: order.email,
      cod,
      totalPaise: order.total,
      address: {
        fullName: address.fullName ?? '',
        line1: address.line1 ?? '',
        line2: address.line2 ?? null,
        city: address.city ?? '',
        state: address.state ?? '',
        postalCode: address.postalCode ?? '',
        phone: address.phone ?? '',
      },
      items: items.map((i) => ({
        name: `${i.productName} (${i.size})`,
        sku: getVariant(i.productId, i.size)?.id ?? `${i.productId}-${i.size}`,
        quantity: i.quantity,
        unitPaise: i.unitPrice,
      })),
    },
    config,
    options.fetchImpl
  );

  if (!result.ok) {
    await db.update(orders).set({ shipment: null }).where(eq(orders.id, order.id));
    return result;
  }

  await db
    .update(orders)
    .set({ awb: result.shipment.awb, shipment: result.shipment, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await recordAudit({
    actor: actor.username,
    actorRole: actor.role,
    action: 'order.courier_booked',
    entityType: 'order',
    entityId: orderNumber,
    after: { awb: result.shipment.awb, courier: result.shipment.courierName },
  }).catch(() => {});
  return { ok: true, awb: result.shipment.awb };
}

/**
 * Marks a cash-on-delivery order paid once it is delivered: the courier
 * collected the money at the door. Through the payment state machine, like
 * every other payment, so revenue figures include COD sales.
 */
export async function recordCodCollected(orderId: string): Promise<void> {
  const [order] = await db
    .select({ provider: orders.paymentProvider, paymentStatus: orders.paymentStatus, total: orders.total })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.provider !== 'cod' || order.paymentStatus === 'paid') return;
  await applyPaymentSignal(orderId, { type: 'captured', amount: order.total });
}

export type TrackingResult = 'unknown_awb' | 'recorded' | 'advanced' | 'flagged';

/** Applies one courier tracking update. Safe to repeat and to receive out of order. */
export async function applyTrackingUpdate(update: TrackingUpdate): Promise<TrackingResult> {
  const [order] = await db.select().from(orders).where(eq(orders.awb, update.awb)).limit(1);
  if (!order) return 'unknown_awb';

  const shipment = {
    ...((order.shipment ?? {}) as Partial<BookedShipment>),
    statusId: update.statusId,
    statusLabel: update.statusLabel,
    updatedAt: new Date().toISOString(),
  };
  await db.update(orders).set({ shipment }).where(eq(orders.id, order.id));

  const effect = trackingEffect(update.statusId);

  if (effect.kind === 'problem') {
    if (order.attentionReason) return 'recorded';
    await db
      .update(orders)
      .set({ attentionReason: effect.reason, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await emitEvent('order.needs_attention', order.id, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason: effect.reason,
    });
    return 'flagged';
  }
  if (effect.kind !== 'status' || !canAdvance(order.status, effect.status)) return 'recorded';

  // Compare-and-set on the status read above: two updates racing cannot both move it.
  const moved = await db
    .update(orders)
    .set({ status: effect.status, updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (moved.length === 0) return 'recorded';

  await recordAudit({
    actor: 'courier',
    actorRole: null,
    action: 'order.status',
    entityType: 'order',
    entityId: order.orderNumber,
    before: { status: order.status },
    after: { status: effect.status, courierStatus: update.statusLabel },
  }).catch(() => {});

  try {
    if (effect.status === 'shipped') {
      await emitEvent('order.shipped', order.id, { orderId: order.id, orderNumber: order.orderNumber });
    } else if (effect.status === 'delivered') {
      await recordCodCollected(order.id);
    } else if (effect.status === 'returned') {
      // Back on the shelf. A prepaid customer is owed a refund, which is the owner's call.
      await restoreOrderStock(order.id);
      if (order.paymentStatus === 'paid' && order.paymentProvider !== 'cod') {
        const reason = 'Parcel returned to us undelivered. Refund the customer, then clear this.';
        await db.update(orders).set({ attentionReason: reason }).where(eq(orders.id, order.id));
        await emitEvent('order.needs_attention', order.id, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason,
        });
      }
    }
  } catch (err) {
    // The status already moved; a follow-up failing must not make the webhook retry it.
    reportError(err, { scope: 'shipping.followUp', correlationId: order.orderNumber });
  }
  return 'advanced';
}
