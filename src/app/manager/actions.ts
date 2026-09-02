'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders, inventory, restockRequests } from '@/db/schema';
import { SESSION_COOKIE } from '@/lib/auth';
import { getStaffSession } from '@/lib/staff-auth';
import { recordEvent } from '@/lib/activity';

/**
 * Dispatch and stock actions for the inventory manager.
 *
 * Every action resolves the session itself and records who did it. A stock
 * count that changed with no name against it is an argument waiting to happen
 * — "I did not touch it" is unanswerable without an audit trail.
 */

/**
 * The manager's fulfilment ladder.
 *
 * Narrower than the owner's: the manager moves an order forward through
 * dispatch and cannot cancel one. Cancelling touches money — refunds, and a
 * customer who must be told — which is the owner's call.
 */
const DISPATCH_FLOW = {
  pending: ['fulfilled'],
  paid: ['fulfilled'],
  fulfilled: ['shipped'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
} as const satisfies Record<string, readonly string[]>;

type DispatchStatus = keyof typeof DISPATCH_FLOW;

/** What the manager may do next to an order in this state. */
export async function nextDispatchSteps(current: string): Promise<readonly string[]> {
  return DISPATCH_FLOW[current as DispatchStatus] ?? [];
}

/** Wording for the button, since the internal names mean nothing to a person. */
export async function dispatchActionLabel(status: string): Promise<string> {
  const labels: Record<string, string> = {
    fulfilled: 'Mark packed',
    shipped: 'Hand to courier',
    out_for_delivery: 'Out for delivery',
    delivered: 'Mark delivered',
  };
  return labels[status] ?? status;
}

async function requireManager() {
  if (!isDatabaseConfigured()) return null;
  // Either role: the owner has to be able to pack parcels when the manager is
  // away, and locking them out of their own dispatch queue helps nobody.
  return getStaffSession();
}

/** Moves an order along the dispatch ladder. */
export async function advanceDispatch(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;

  const orderNumber = String(formData.get('orderNumber') ?? '');
  const next = String(formData.get('status') ?? '');
  if (!orderNumber || !next) return;

  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return;

  // Checked against the ladder, not taken from the form: a stale tab must not
  // be able to skip an order straight to delivered.
  const allowed = DISPATCH_FLOW[order.status as DispatchStatus] ?? [];
  if (!allowed.includes(next as never)) return;

  await db
    .update(orders)
    .set({ status: next as typeof orders.$inferInsert.status, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await recordEvent({
    name: 'admin.order_status_changed',
    props: { orderNumber, from: order.status, to: next, by: session.username, role: session.role },
  }).catch(() => {});

  revalidatePath('/manager');
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderNumber}`);
}

/**
 * Adds to or removes from a stock count.
 *
 * A delta, not an absolute — the opposite of the owner's screen, and
 * deliberately so. The manager is standing at the shelf putting twelve units
 * away or taking three out; "+12" is what actually happened, and asking them
 * to compute the new total is how a miscount enters the system.
 *
 * The database does the arithmetic (`quantity + delta`) rather than the
 * application reading and writing back, so two people counting at once cannot
 * overwrite each other's change.
 */
export async function adjustStock(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;

  const productId = String(formData.get('productId') ?? '');
  const size = String(formData.get('size') ?? '');
  const delta = Number(String(formData.get('delta') ?? ''));

  if (!productId || !size) return;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) return;

  await db
    .insert(inventory)
    // A SKU that was never counted starts from the delta itself, clamped at
    // zero so "remove 3" from nothing does not create a negative shelf.
    .values({ productId, size, quantity: Math.max(0, delta) })
    .onConflictDoUpdate({
      target: [inventory.productId, inventory.size],
      set: {
        quantity: sql`greatest(0, ${inventory.quantity} + ${delta})`,
        updatedAt: new Date(),
      },
    });

  await recordEvent({
    name: 'admin.stock_set',
    props: { productId, size, delta, by: session.username, role: session.role },
  }).catch(() => {});

  revalidatePath('/manager/stock');
  revalidatePath('/admin/inventory');
}

/**
 * Raises a request for more of something.
 *
 * The count on hand is captured now rather than looked up when the owner reads
 * it. By then the shelf has moved, and "we asked when there were 3 left" is
 * the part that makes the request judgeable.
 */
export async function requestRestock(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;

  const productId = String(formData.get('productId') ?? '');
  const size = String(formData.get('size') ?? '');
  const requested = Number(String(formData.get('requestedQuantity') ?? ''));
  const note = String(formData.get('note') ?? '').trim().slice(0, 500) || null;

  if (!productId || !size) return;
  if (!Number.isInteger(requested) || requested <= 0 || requested > 100_000) return;

  const [existing] = await db
    .select({ id: restockRequests.id })
    .from(restockRequests)
    .where(
      and(
        eq(restockRequests.productId, productId),
        eq(restockRequests.size, size),
        eq(restockRequests.status, 'open')
      )
    )
    .limit(1);

  // One open request per SKU. A second is not more information, it is noise on
  // the owner's list.
  if (existing) return;

  const [stock] = await db
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.productId, productId), eq(inventory.size, size)))
    .limit(1);

  await db.insert(restockRequests).values({
    productId,
    size,
    requestedQuantity: requested,
    quantityAtRequest: stock?.quantity ?? 0,
    note,
    requestedBy: session.username,
  });

  revalidatePath('/manager/stock');
  revalidatePath('/manager/requests');
  revalidatePath('/admin');
}

/** Ends the staff session. */
export async function managerSignOut(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  // Both roles share one sign-in page; it keeps its original path so existing
  // links and the middleware redirect target stay valid.
  redirect('/admin-login');
}
