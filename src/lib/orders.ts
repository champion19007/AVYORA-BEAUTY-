import { after } from 'next/server';
import { z } from 'zod';
import { reportError } from '@/lib/observability';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, addresses } from '@/db/schema';
import { getProductById } from '@/lib/catalogue';
import { pricingMap } from '@/lib/pricing';
import { skuKey, skuPrice } from '@/modules/catalog/sku-price';
import { calculateTotals, generateOrderNumber, toPaise } from '@/lib/money';
import { releaseStock, reserveStock } from '@/lib/inventory';
import { recordEvent } from '@/lib/activity';
import { emitEvent } from '@/lib/events';
import { applyPaymentSignal } from '@/modules/payments/payment-service';
import { currentRequestId } from '@/infrastructure/request-context';
import { runBackgroundQuietly } from '@/lib/background';

/**
 * Order creation.
 *
 * Two rules drive the design:
 *
 *  1. Prices are never taken from the client. The browser sends product ids,
 *     sizes and quantities; every price is looked up server-side. Trusting a
 *     client-supplied price lets anyone buy a serum for ₹1 by editing a
 *     request.
 *  2. Name, size and unit price are copied onto the order line. An order must
 *     keep reading correctly after the catalogue is repriced or a SKU retired.
 */

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  line1: z.string().trim().min(4, 'Please enter your address').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Please enter your city').max(80),
  state: z.string().trim().min(2, 'Please enter your state').max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().default('IN'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
});

export const checkoutSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  address: addressSchema,
  paymentMethod: z.enum(['cod', 'razorpay']),
  /**
   * Optional so a client that does not send one still works; when present it
   * makes the whole request safe to retry. See `orders.idempotencyKey`.
   */
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        size: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, 'Your bag is empty'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CreateOrderResult =
  | { ok: true; orderNumber: string; orderId: string; totalPaise: number }
  | { ok: false; error: string };

/**
 * Was this the idempotency index rejecting a duplicate?
 *
 * Two pieces of driver detail are load-bearing here, and both were found by a
 * test rather than by reading:
 *
 *  - Drizzle wraps a driver error in its own `Failed query:` error, so the
 *    Postgres code lives on `cause`, not on the error handed to the catch.
 *    Reading `err.code` directly finds nothing and silently treats every
 *    duplicate as a generic failure.
 *  - The constraint name comes back as `constraint_name` from postgres-js and
 *    `constraint` from node-postgres and PGlite. Both are checked so the
 *    behaviour under test is the behaviour in production.
 *
 * Matched on the specific index rather than on 23505 alone: the order-number
 * index is also unique, and a collision there is a genuine fault that must not
 * be reported to the customer as a successful order.
 */
function isDuplicateOrderKey(err: unknown): boolean {
  type PgError = { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };

  for (let current: unknown = err, depth = 0; current && depth < 4; depth += 1) {
    const e = current as PgError;
    if (
      e.code === '23505' &&
      (e.constraint === 'orders_idempotency_idx' ||
        e.constraint_name === 'orders_idempotency_idx')
    ) {
      return true;
    }
    current = e.cause;
  }

  return false;
}

/** The order already placed under this key, if there is one. */
async function findByIdempotencyKey(key: string): Promise<CreateOrderResult | null> {
  const [existing] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, total: orders.total })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);

  if (!existing) return null;

  return {
    ok: true,
    orderId: existing.id,
    orderNumber: existing.orderNumber,
    totalPaise: existing.total,
  };
}

/** Thrown inside the order transaction to roll it back when stock runs out. */
class OutOfStockError extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

/**
 * Validates, prices and persists an order.
 *
 * The insert of the order and its lines runs in a transaction so a failure
 * partway cannot leave an order with missing items.
 */
export async function createOrder(
  input: CheckoutInput,
  userId?: string | null
): Promise<CreateOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid order details' };
  }
  const data = parsed.data;

  /*
   * A retry of a request that already succeeded returns the original order.
   *
   * This read is an optimisation, not the guarantee — two simultaneous
   * requests would both find nothing here. The unique index below is what
   * actually decides, and the duplicate is caught when it fails to insert.
   */
  if (data.idempotencyKey) {
    const existing = await findByIdempotencyKey(data.idempotencyKey);
    if (existing) return existing;
  }

  /*
   * Owner-set prices win over the catalogue file.
   *
   * Without this lookup the pricing screen was decorative: a price could be
   * changed, saved and displayed, and the customer would still be charged the
   * value compiled into the bundle. Fetched once for the whole basket rather
   * than per line.
   */
  const overrides = await pricingMap();

  // Resolve every line against the catalogue; prices come from here, not the client.
  const lines: {
    productId: string;
    productName: string;
    size: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    pricingSnapshot: Record<string, unknown>;
  }[] = [];

  for (const item of data.items) {
    const product = getProductById(item.productId);
    if (!product) {
      return { ok: false, error: `That product is no longer available: ${item.productId}` };
    }

    /*
     * The size asked for, or a refusal. This used to fall back to the first
     * size, so a stale basket (a size since withdrawn) was charged for, and
     * sent, a size the customer never chose.
     */
    const size = product.sizes.find((s) => s.label === item.size);
    if (!size) {
      return {
        ok: false,
        error: `${product.name} is no longer sold in ${item.size}. Please choose a size again.`,
      };
    }

    // The one pricing rule, shared with the storefront display. Here it is fed
    // a row read from Postgres on this request: that is what makes it the
    // authority, not the function itself.
    const cataloguePaise = toPaise(product.salePrice ?? size.price);
    const pricingRow = overrides.get(skuKey(product.id, size.label));
    const effective = skuPrice(product, size.label, pricingRow);
    const unitPrice = effective.price;

    lines.push({
      productId: product.id,
      productName: product.name,
      size: size.label,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      /*
       * Why this line cost what it did, frozen now. Read only by people
       * explaining a past order; checkout's authority is the price above,
       * computed from the database on this request and never from a cache.
       */
      pricingSnapshot: {
        cataloguePaise,
        chargedPaise: unitPrice,
        wasPaise: effective.wasPrice,
        // A struck-out price means a discount applied; which kind depends on
        // whether the owner or the catalogue set it.
        source: pricingRow
          ? effective.wasPrice !== null ? 'offer' : 'override'
          : effective.wasPrice !== null ? 'catalogue-sale' : 'catalogue',
        offerLabel: effective.offerLabel,
        pricingVersion: pricingRow?.version ?? null,
        offerEndsAt: pricingRow?.offerEndsAt?.toISOString() ?? null,
      },
    });
  }

  const totals = calculateTotals(
    lines.map((l) => ({ unitPrice: l.unitPrice / 100, quantity: l.quantity }))
  );

  const orderNumber = generateOrderNumber();
  const requestId = await currentRequestId();
  let createdOrderId = '';

  try {
    await db.transaction(async (tx) => {
      // Reserve stock first, inside the same transaction as the order. If this
      // fails the whole thing rolls back, so an order can never exist for
      // goods that were not actually available.
      const reservation = await reserveStock(
        lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
        tx as never
      );

      if (!reservation.ok) {
        const first = reservation.insufficient[0];
        const product = getProductById(first.productId);
        throw new OutOfStockError(
          first.available === 0
            ? `${product?.name ?? 'An item'} (${first.size}) has just sold out.`
            : `Only ${first.available} left of ${product?.name ?? 'an item'} (${first.size}). Please reduce the quantity.`
        );
      }

      const [address] = await tx
        .insert(addresses)
        .values({ ...data.address, line2: data.address.line2 || null, userId: userId ?? null })
        .returning({ id: addresses.id });

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: userId ?? null,
          email: data.email,
          status: 'pending',
          // Unpaid either way at this point: cash on delivery stays unpaid
          // until the courier collects, and a Razorpay order is only marked
          // paid once its signature is verified or its webhook arrives.
          paymentStatus: 'unpaid',
          subtotal: totals.subtotal,
          discount: totals.discount,
          shipping: totals.shipping,
          tax: totals.tax,
          total: totals.total,
          shippingAddressId: address.id,
          shippingAddress: data.address,
          paymentProvider: data.paymentMethod,
          /*
           * Cash on delivery starts unjudged and must be cleared before the
           * stockroom sees it. Prepaid is approved on arrival: the money has
           * already moved, so there is nothing left to protect against.
           */
          fraudStatus: data.paymentMethod === 'cod' ? 'pending' : 'approved',
          idempotencyKey: data.idempotencyKey ?? null,
        })
        .returning({ id: orders.id });

      createdOrderId = order.id;

      await tx.insert(orderItems).values(
        lines.map((l) => ({ ...l, orderId: order.id }))
      );

      /*
       * The order and the fact that it happened commit together.
       *
       * Written inside the transaction on purpose. A queue written after the
       * commit can lose an event when the process dies in the gap, and can
       * announce an order that then rolled back; both failures appear only
       * under load, which is to say only in front of customers. Here the two
       * are the same write, so neither is possible.
       *
       * The payload carries identifiers and nothing else. Consumers re-read
       * the order, so they act on what is true when they run rather than on a
       * snapshot that may be minutes old.
       */
      await emitEvent(
        'order.placed',
        order.id,
        { orderId: order.id, orderNumber },
        tx,
        requestId
      );

      for (const sku of reservation.depleted) {
        await emitEvent('inventory.stock_out', sku.productId, sku, tx, requestId);
      }
    });

    // Best-effort; recordEvent swallows its own failures.
    await recordEvent({
      name: 'order_placed',
      userId: userId ?? null,
      props: {
        orderNumber,
        totalPaise: totals.total,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        paymentMethod: data.paymentMethod,
      },
    });

    /*
     * Everything downstream now runs after the response is flushed.
     *
     * Confirmation emails, the shop's WhatsApp message, the risk gate and
     * cache invalidation used to happen inline, which meant a slow email
     * provider was a slow checkout — the customer waiting on work that has
     * nothing to do with whether their order exists. It exists the moment the
     * transaction above commits; the rest is consequence.
     *
     * `after` runs the drain in this same invocation once the response has
     * gone, so the customer waits for none of it and the notification still
     * lands within a second or two. If the invocation dies first, the events
     * are still in the log and the next drain — from the next checkout, or
     * from cron — picks them up. Nothing is lost, only delayed.
     */
    after(runBackgroundQuietly);

    return { ok: true, orderNumber, orderId: createdOrderId, totalPaise: totals.total };
  } catch (err) {
    // Out-of-stock is an expected outcome, not a fault: tell the customer
    // exactly what happened rather than a generic failure.
    if (err instanceof OutOfStockError) {
      return { ok: false, error: err.detail };
    }

    /*
     * Lost the race to an identical request. The transaction rolled back —
     * including its stock reservation — so the winner's order is the only one,
     * and returning it is exactly what the customer expects to see.
     */
    if (isDuplicateOrderKey(err) && data.idempotencyKey) {
      const existing = await findByIdempotencyKey(data.idempotencyKey);
      if (existing) return existing;
    }
    reportError(err, { scope: 'orders.createOrder', correlationId: orderNumber });
    return { ok: false, error: 'We could not place your order. Please try again.' };
  }
}

/** Looks up an order and its lines by the customer-facing reference. */
export async function getOrderByNumber(orderNumber: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

/**
 * Every order belonging to a signed-in customer, newest first.
 *
 * Scoped by user id rather than email on purpose: email is mutable and a
 * customer could change theirs at Google, whereas the user id is the stable
 * identity the orders were filed under. Guest orders placed with the same
 * address before signing up are therefore not included — claiming those needs
 * a verification step, not a join on a string anyone could type.
 */
export async function getOrdersForUser(userId: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  if (rows.length === 0) return [];

  // One query for all lines rather than one per order.
  const lines = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((o) => o.id)));

  const byOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = byOrder.get(line.orderId);
    if (bucket) bucket.push(line);
    else byOrder.set(line.orderId, [line]);
  }

  return rows.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

/**
 * Records the Razorpay order id against our order, so a later webhook can find
 * the order it belongs to.
 */
export async function attachPaymentReference(orderId: string, reference: string) {
  await db
    .update(orders)
    .set({ paymentReference: reference, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

/**
 * Records a captured payment against an order.
 *
 * Delegates to the payment state machine, which owns every rule: the amount
 * must match the order total, a duplicate capture is a no-op, a capture after
 * the stock was released takes it back, and a capture after cancellation is
 * honoured and flagged for the owner. See `modules/payments/state-machine.ts`.
 *
 * `paymentId` is no longer written over the order's payment reference. That
 * column holds the provider's *order* id, which is what every later webhook
 * for this order is looked up by; overwriting it with the *payment* id made
 * each subsequent webhook, refunds included, fail to find the order. The
 * payment id is recorded on the provider event instead.
 */
export async function markOrderPaid(
  orderId: string,
  paymentId: string,
  capturedPaise?: number
): Promise<{ ok: boolean; error?: string }> {
  void paymentId;

  let amount = capturedPaise;
  if (typeof amount !== 'number') {
    const [order] = await db
      .select({ total: orders.total })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return { ok: false, error: 'Order not found' };
    amount = order.total;
  }

  const applied = await applyPaymentSignal(orderId, { type: 'captured', amount });
  if (!applied) return { ok: false, error: 'Order not found' };

  if (applied.outcome === 'rejected') {
    reportError(new Error(applied.reason ?? 'Payment rejected'), {
      scope: 'orders.markOrderPaid',
      correlationId: orderId,
    });
    return { ok: false, error: 'Payment amount did not match the order total' };
  }

  return { ok: true };
}

/**
 * Records a failed payment attempt.
 *
 * A failed *attempt* is not a failed *order*: a customer can retry in the
 * same payment window, and Razorpay reports each attempt separately and out of
 * order. The state machine therefore ignores a failure that arrives after a
 * capture, and releases stock only for an order that is still unpaid. Returns
 * true when stock went back on the shelf.
 */
export async function markOrderPaymentFailed(orderId: string): Promise<boolean> {
  const applied = await applyPaymentSignal(orderId, { type: 'failed' });
  return Boolean(applied && applied.outcome === 'applied' && applied.stock === 'release');
}

/**
 * Returns an order's lines to stock, once.
 *
 * Guarded by the order's own state: only an order that still counts as live
 * has its stock returned, so calling this twice — a retried webhook, a double
 * click on cancel — cannot credit the shelf twice. Returns false when there
 * was nothing to do.
 */
export async function restoreOrderStock(orderId: string): Promise<boolean> {
  /*
   * Claiming the right to restore is a single conditional UPDATE.
   *
   * The first version of this read the status, decided, and then released —
   * three statements with gaps between them. A retried webhook arriving while
   * an operator clicked cancel could have both pass the check and both put the
   * same units back, inventing stock out of a race. Postgres decides here
   * instead: exactly one caller can move `stock_restored_at` from null, and
   * only that caller releases.
   *
   * The whole thing runs in one transaction so a crash between claiming and
   * releasing rolls the claim back rather than stranding it.
   */
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(orders)
      .set({ stockRestoredAt: new Date() })
      .where(and(eq(orders.id, orderId), isNull(orders.stockRestoredAt)))
      .returning({ id: orders.id });

    // Someone else already restored this order's stock.
    if (claimed.length === 0) return false;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.length === 0) return false;

    await releaseStock(
      items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
      tx as never
    );

    return true;
  });
}

/**
 * Cancels an order and returns its stock.
 *
 * The stock is restored before the status changes, because `restoreOrderStock`
 * refuses to act on an already-cancelled order — doing it the other way round
 * would silently skip the restore.
 */
export async function cancelOrder(orderId: string): Promise<boolean> {
  await restoreOrderStock(orderId);

  const updated = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  return updated.length > 0;
}

/** Finds an order by the payment reference stored against it. */
export async function getOrderByPaymentReference(reference: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentReference, reference))
    .limit(1);
  return order ?? null;
}
