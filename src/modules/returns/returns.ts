import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orderItems, orders, returnRequests } from '@/db/schema';
import { restockReturnedUnits } from '@/lib/inventory';
import { restoreOrderStock } from '@/lib/orders';
import { emitEvent } from '@/lib/events';
import { formatPaise } from '@/lib/money';
import { createCashfreeRefund, fetchCashfreeRefund, getCashfreeConfig } from '@/lib/cashfree';
import { emailDeliveryConfigured, sendEmail } from '@/lib/notify';
import { recordAudit } from '@/modules/audit/audit';
import { reportError } from '@/lib/observability';
import { RETURN_WINDOW_DAYS } from './policy';

/**
 * Returns, cancellations and refunds.
 *
 * One record (`return_requests`) follows each case from the customer's
 * request, or the courier bringing a parcel back, through inspection to the
 * refund. The rules the refund policy page promises live here:
 *
 *  - Change of mind: unopened items only, within RETURN_WINDOW_DAYS of
 *    delivery, refunded once the parcel is back and inspected.
 *  - Damaged or wrong item: opened or not, refundable as soon as staff
 *    approve, delivery included.
 *  - Cancelled before packing: the whole order, nothing to send back.
 *  - Returned undelivered by the courier: waits for the parcel, then
 *    inspection, like any return. Nothing goes back on the shelf unseen.
 *
 * Every refund is capped by what the order has left unrefunded
 * (`orders.refunded_total`), so two refunds can never exceed what was paid.
 */

export { RETURN_WINDOW_DAYS };

export type ReturnKind = 'unopened' | 'damaged' | 'wrong_item' | 'cancelled' | 'undelivered';
export const CUSTOMER_KINDS = ['unopened', 'damaged', 'wrong_item'] as const;
export const KIND_LABEL: Record<ReturnKind, string> = {
  unopened: 'Unopened, changed my mind',
  damaged: 'Arrived damaged or faulty',
  wrong_item: 'Wrong item sent',
  cancelled: 'Cancelled before packing',
  undelivered: 'Returned undelivered by the courier',
};

export type ReturnLine = { orderItemId: number; quantity: number };
type Result = { ok: true } | { ok: false; error: string };
type Order = typeof orders.$inferSelect;
type Actor = { id: string; role: string | null };

const UPI_ID = /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** When a delivered order stops being returnable; null when it is not delivered. */
export function returnWindowEndsAt(order: Pick<Order, 'status' | 'deliveredAt' | 'updatedAt'>): Date | null {
  if (order.status !== 'delivered') return null;
  return new Date((order.deliveredAt ?? order.updatedAt).getTime() + RETURN_WINDOW_DAYS * 86_400_000);
}

/** The window's end while it is still open, else null. */
export function openReturnWindow(order: Pick<Order, 'status' | 'deliveredAt' | 'updatedAt'>, now = Date.now()) {
  const ends = returnWindowEndsAt(order);
  return ends && now <= ends.getTime() ? ends : null;
}

/** Whether the customer may still cancel: nothing has been packed yet. */
export const isCancellable = (order: Pick<Order, 'status'>) => order.status === 'pending' || order.status === 'paid';

async function tell(to: string | null | undefined, subject: string, text: string) {
  if (!to || !emailDeliveryConfigured()) return;
  await sendEmail(to, subject, text).catch((err) => reportError(err, { scope: 'returns.notify' }));
}

/** The paise a line was actually sold for, per unit, after its share of the discount. */
const paidPerUnit = (item: typeof orderItems.$inferSelect) =>
  Math.floor((item.lineTotal - item.discount) / item.quantity);

/** What staff are offered to refund: the items as paid, plus delivery unless it was a change of mind. */
export function suggestedRefund(
  order: Pick<Order, 'shipping' | 'total' | 'refundedTotal'>,
  items: (typeof orderItems.$inferSelect)[],
  request: { kind: string; items: ReturnLine[] }
): number {
  const lines = request.items.reduce((sum, line) => {
    const item = items.find((i) => i.id === line.orderItemId);
    return item ? sum + paidPerUnit(item) * line.quantity : sum;
  }, 0);
  const all =
    request.kind === 'cancelled' || request.kind === 'undelivered'
      ? order.total
      : lines + (request.kind === 'unopened' ? 0 : order.shipping);
  return Math.max(0, Math.min(all, order.total - order.refundedTotal));
}

/** All requests for an order, newest first. */
export async function returnsForOrder(orderId: string) {
  return db
    .select()
    .from(returnRequests)
    .where(eq(returnRequests.orderId, orderId))
    .orderBy(desc(returnRequests.createdAt));
}

/** Units of each line already in a return that was not rejected. */
async function alreadyReturned(orderId: string): Promise<Map<number, number>> {
  const rows = await db
    .select({ items: returnRequests.items })
    .from(returnRequests)
    .where(and(eq(returnRequests.orderId, orderId), sql`${returnRequests.status} <> 'rejected'`));
  const map = new Map<number, number>();
  for (const r of rows) {
    for (const l of r.items as ReturnLine[]) map.set(l.orderItemId, (map.get(l.orderItemId) ?? 0) + l.quantity);
  }
  return map;
}

/** A unique violation: here, only the one-open-request-per-order index. Drizzle wraps the driver's error in `cause`. */
const isOpenConflict = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
};

/** A customer asks to send something back. */
export async function requestReturn(
  order: Order,
  input: { kind: string; items: ReturnLine[]; note?: string; refundTo?: string }
): Promise<Result> {
  const ends = returnWindowEndsAt(order);
  if (!ends) return { ok: false, error: 'Returns open once your order has been delivered.' };
  if (Date.now() > ends.getTime()) {
    return {
      ok: false,
      error: `Returns close ${RETURN_WINDOW_DAYS} days after delivery. Contact us if something is wrong.`,
    };
  }
  if (!(CUSTOMER_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: 'Choose a reason.' };

  const existing = await returnsForOrder(order.id);
  if (existing.some((r) => ['requested', 'approved', 'received'].includes(r.status))) {
    return { ok: false, error: 'There is already a return open for this order.' };
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const taken = await alreadyReturned(order.id);
  const lines = input.items.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'Choose at least one item to return.' };
  for (const line of lines) {
    const item = items.find((i) => i.id === line.orderItemId);
    const left = item ? item.quantity - (taken.get(item.id) ?? 0) : 0;
    if (!Number.isInteger(line.quantity) || line.quantity > left) {
      return { ok: false, error: `You can return at most ${left} of ${item?.productName ?? 'that item'}.` };
    }
  }

  const refundTo = input.refundTo?.trim() || null;
  if (order.paymentProvider === 'cod' && (!refundTo || !UPI_ID.test(refundTo))) {
    return { ok: false, error: 'Enter the UPI ID to refund to, like name@okbank. Cash orders are refunded by UPI.' };
  }

  try {
    await db.insert(returnRequests).values({
      orderId: order.id,
      kind: input.kind,
      items: lines,
      customerNote: input.note?.trim().slice(0, 1000) || null,
      refundTo: order.paymentProvider === 'cod' ? refundTo : null,
    });
  } catch (err) {
    if (isOpenConflict(err)) return { ok: false, error: 'There is already a return open for this order.' };
    throw err;
  }

  await Promise.all([
    tell(
      order.email,
      `We have your return request for ${order.orderNumber}`,
      `We have your request (${KIND_LABEL[input.kind as ReturnKind]}) and will reply within two working days with what happens next.`
    ),
    tell(
      process.env.OWNER_EMAIL,
      `Return requested: ${order.orderNumber}`,
      `${KIND_LABEL[input.kind as ReturnKind]}.\n${input.note?.trim() ?? ''}\n\nDecide in the admin under Returns.`
    ),
  ]);
  return { ok: true };
}

/**
 * The customer cancels before anything is packed.
 *
 * Compare-and-set on the status, so a cancel arriving while the stockroom
 * marks the order packed cannot undo the packing: one of the two wins.
 * A paid online order gets a refund case for the owner to issue.
 */
export async function cancelByCustomer(order: Order): Promise<Result> {
  const [cancelled] = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), inArray(orders.status, ['pending', 'paid'])))
    .returning();
  if (!cancelled) {
    return {
      ok: false,
      error: 'Your order is already being packed, so it cannot be cancelled here. Contact us and we will help.',
    };
  }

  await restoreOrderStock(order.id);
  await emitEvent('order.cancelled', order.id, { orderId: order.id, orderNumber: order.orderNumber });
  await recordAudit({
    actor: 'customer',
    actorRole: 'customer',
    action: 'order.status',
    entityType: 'order',
    entityId: order.orderNumber,
    before: { status: order.status },
    after: { status: 'cancelled' },
  }).catch(() => {});

  const paidOnline = cancelled.paymentStatus === 'paid' && cancelled.paymentProvider !== 'cod';
  if (paidOnline) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await db
      .insert(returnRequests)
      .values({
        orderId: order.id,
        kind: 'cancelled',
        status: 'received',
        items: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
      })
      .onConflictDoNothing();
  }

  await Promise.all([
    tell(
      order.email,
      `Order ${order.orderNumber} is cancelled`,
      paidOnline
        ? `Your order is cancelled. We will refund ${formatPaise(order.total)} to your original payment method within 5 to 7 working days.`
        : 'Your order is cancelled. Nothing was charged.'
    ),
    tell(
      process.env.OWNER_EMAIL,
      `Cancelled by customer: ${order.orderNumber}`,
      paidOnline ? 'Paid online: issue the refund in the admin under Returns.' : 'Nothing to refund.'
    ),
  ]);
  return { ok: true };
}

/**
 * The courier brought a parcel back undelivered.
 *
 * Opens a case instead of putting the stock straight back: the parcel may have
 * been opened or crushed in transit, so it waits for someone to look at it.
 */
export async function openUndeliveredReturn(orderId: string): Promise<void> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await db
    .insert(returnRequests)
    .values({
      orderId,
      kind: 'undelivered',
      status: 'approved',
      items: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
    })
    .onConflictDoNothing();
}

async function load(id: string) {
  const [request] = await db.select().from(returnRequests).where(eq(returnRequests.id, id));
  if (!request) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, request.orderId));
  return order ? { request, order } : null;
}

/** Staff approve or reject a customer's request. */
export async function decideReturn(id: string, approve: boolean, actor: Actor, note?: string): Promise<Result> {
  const found = await load(id);
  if (!found) return { ok: false, error: 'That return no longer exists.' };
  const [moved] = await db
    .update(returnRequests)
    .set({
      status: approve ? 'approved' : 'rejected',
      staffNote: note?.trim() || null,
      decidedBy: actor.id,
      updatedAt: new Date(),
      // A rejected request will never be refunded: drop the UPI ID now.
      ...(approve ? {} : { refundTo: null }),
    })
    .where(and(eq(returnRequests.id, id), eq(returnRequests.status, 'requested')))
    .returning({ id: returnRequests.id });
  if (!moved) return { ok: false, error: 'Someone already decided this one. Reload to see it.' };

  const { order, request } = found;
  await tell(
    order.email,
    `Your return for ${order.orderNumber}`,
    approve
      ? request.kind === 'unopened'
        ? 'Your return is approved. We will send pickup details; the refund follows once the parcel is back with us and checked.'
        : 'Your return is approved. We will be in touch about the refund or replacement shortly.'
      : `We could not accept this return.${note?.trim() ? `\n\n${note.trim()}` : ''}`
  );
  return { ok: true };
}

/**
 * The parcel is back and has been looked at. `restock` puts the units back on
 * sale (sealed, undamaged); otherwise they are written off and stay out of stock.
 */
export async function receiveReturn(id: string, restock: boolean, actor: Actor): Promise<Result> {
  const found = await load(id);
  if (!found) return { ok: false, error: 'That return no longer exists.' };
  const lines = found.request.items as ReturnLine[];

  const ok = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(returnRequests)
      .set({ status: 'received', updatedAt: new Date(), decidedBy: actor.id })
      .where(and(eq(returnRequests.id, id), eq(returnRequests.status, 'approved')))
      .returning({ id: returnRequests.id });
    if (!claimed) return false;
    if (restock) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, found.order.id));
      for (const line of lines) {
        const item = items.find((i) => i.id === line.orderItemId);
        if (item) await restockReturnedUnits(tx as never, item, line.quantity);
      }
      await tx
        .update(returnRequests)
        .set({ restockedUnits: lines.reduce((n, l) => n + l.quantity, 0) })
        .where(eq(returnRequests.id, id));
    }
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'return.received',
        entityType: 'order',
        entityId: found.order.orderNumber,
        before: null,
        after: { returnId: id, restocked: restock },
      },
      tx as never
    );
    return true;
  });
  if (!ok) return { ok: false, error: 'This return is not waiting for a parcel. Reload to see where it is.' };
  return { ok: true };
}

/**
 * Issues the refund. Online payments go back through Cashfree; cash orders
 * are paid by UPI outside the system and recorded here with the transfer's
 * reference. `amountPaise` 0 closes a case with nothing to refund (an unpaid
 * cash order that came back undelivered).
 */
export async function refundReturn(
  id: string,
  input: { amountPaise: number; reference?: string },
  actor: Actor
): Promise<Result> {
  const found = await load(id);
  if (!found) return { ok: false, error: 'That return no longer exists.' };
  const { request, order } = found;

  if (request.status === 'approved' && request.kind === 'unopened') {
    return { ok: false, error: 'Refund a change-of-mind return once the parcel is back and checked.' };
  }
  const remaining = order.total - order.refundedTotal;
  const amount = input.amountPaise;
  const paid = order.paymentStatus === 'paid';
  if (!Number.isInteger(amount) || amount < 0 || amount > remaining) {
    return { ok: false, error: `Refund between ₹0 and ${formatPaise(remaining)}.` };
  }
  if (amount > 0 && !paid)
    return { ok: false, error: 'This order was never paid, so there is nothing to refund. Refund ₹0 to close it.' };
  const online = paid && order.paymentProvider !== 'cod' && amount > 0;
  const reference = input.reference?.trim() || null;
  if (paid && !online && amount > 0 && !reference) {
    return {
      ok: false,
      error: `Send ${formatPaise(amount)} to ${request.refundTo ?? 'the customer'} by UPI first, then enter its reference.`,
    };
  }

  // Only one refund attempt at a time per case.
  const [claimed] = await db
    .update(returnRequests)
    .set({ refundStatus: 'pending' })
    .where(
      and(
        eq(returnRequests.id, id),
        isNull(returnRequests.refundStatus),
        inArray(returnRequests.status, ['approved', 'received'])
      )
    )
    .returning({ id: returnRequests.id });
  if (!claimed) return { ok: false, error: 'This refund is already being made. Reload to see it.' };

  let providerRef: string | null = null;
  let providerStatus: 'pending' | 'done' = 'done';
  if (online) {
    const config = getCashfreeConfig();
    const result = config
      ? await createCashfreeRefund(
          order.orderNumber,
          id,
          amount,
          `Avyora ${KIND_LABEL[request.kind as ReturnKind]}`,
          config
        )
      : { error: 'Cashfree is not configured on this deployment.' };
    if ('error' in result || result.status === 'failed') {
      await db.update(returnRequests).set({ refundStatus: null }).where(eq(returnRequests.id, id));
      return { ok: false, error: 'error' in result ? result.error : 'Cashfree cancelled the refund.' };
    }
    providerRef = result.cfRefundId;
    providerStatus = result.status;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(returnRequests)
      .set({
        status: 'refunded',
        refundAmount: amount,
        refundMethod: amount === 0 ? null : online ? 'cashfree' : 'upi',
        refundReference: online ? providerRef : reference,
        refundStatus: providerStatus,
        refundTo: null,
        refundedAt: new Date(),
        decidedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(returnRequests.id, id));
    const [after] = await tx
      .update(orders)
      .set({ refundedTotal: sql`${orders.refundedTotal} + ${amount}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning({ refundedTotal: orders.refundedTotal, total: orders.total, status: orders.status });
    if (amount > 0 && after.refundedTotal >= after.total) {
      await tx
        .update(orders)
        .set({ paymentStatus: 'refunded', ...(after.status === 'delivered' ? { status: 'refunded' as const } : {}) })
        .where(eq(orders.id, order.id));
    }
    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'return.refunded',
        entityType: 'order',
        entityId: order.orderNumber,
        before: { refundedTotal: order.refundedTotal },
        after: {
          returnId: id,
          amount,
          method: online ? 'cashfree' : 'upi',
          reference: online ? providerRef : reference,
        },
      },
      tx as never
    );
  });

  if (amount > 0) {
    await emitEvent('order.refunded', order.id, { orderId: order.id, orderNumber: order.orderNumber, amount });
    await tell(
      order.email,
      `Refund for ${order.orderNumber}`,
      online
        ? `We have refunded ${formatPaise(amount)} to your original payment method. Banks usually show it within 5 to 7 working days.`
        : `We have sent ${formatPaise(amount)} to your UPI ID (reference ${reference}).`
    );
  }
  return { ok: true };
}

/**
 * Asks Cashfree whether a pending refund has gone through.
 *
 * ponytail: a refund Cashfree cancels is marked failed for the owner to redo
 * from the Cashfree dashboard; retrying here would need a fresh refund id.
 */
export async function refreshRefund(id: string): Promise<Result> {
  const found = await load(id);
  const config = getCashfreeConfig();
  if (!found || found.request.refundStatus !== 'pending' || !config) return { ok: true };
  const status = await fetchCashfreeRefund(found.order.orderNumber, id, config);
  if (!status) return { ok: false, error: 'Cashfree could not be reached. Try again shortly.' };
  if (status.status !== 'pending') {
    await db
      .update(returnRequests)
      .set({ refundStatus: status.status, updatedAt: new Date() })
      .where(eq(returnRequests.id, id));
  }
  return { ok: true };
}

export type ReturnCase = {
  request: typeof returnRequests.$inferSelect;
  order: Pick<
    Order,
    'orderNumber' | 'email' | 'paymentProvider' | 'paymentStatus' | 'total' | 'refundedTotal' | 'shipping' | 'status'
  >;
  customerName: string;
  lines: { name: string; size: string; quantity: number }[];
  suggested: number;
};

/** The admin's queue: open cases first, then the most recent closed ones. */
export async function listReturnCases(): Promise<ReturnCase[]> {
  const requests = await db
    .select()
    .from(returnRequests)
    .orderBy(
      sql`case when ${returnRequests.status} in ('requested', 'approved', 'received') then 0 else 1 end`,
      desc(returnRequests.createdAt)
    )
    .limit(100);
  if (requests.length === 0) return [];
  const orderIds = [...new Set(requests.map((r) => r.orderId))];
  const [orderRows, itemRows] = await Promise.all([
    db.select().from(orders).where(inArray(orders.id, orderIds)),
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
  ]);
  return requests.flatMap((request) => {
    const order = orderRows.find((o) => o.id === request.orderId);
    if (!order) return [];
    const items = itemRows.filter((i) => i.orderId === order.id);
    const lines = (request.items as ReturnLine[]).flatMap((l) => {
      const item = items.find((i) => i.id === l.orderItemId);
      return item ? [{ name: item.productName, size: item.size, quantity: l.quantity }] : [];
    });
    return [
      {
        request,
        order,
        customerName: ((order.shippingAddress ?? {}) as { fullName?: string }).fullName ?? '',
        lines,
        suggested: suggestedRefund(order, items, { kind: request.kind, items: request.items as ReturnLine[] }),
      },
    ];
  });
}
