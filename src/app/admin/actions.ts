'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq, and } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders, inventory } from '@/db/schema';
import { isAdmin } from '@/lib/admin-guard';
import { SESSION_COOKIE } from '@/lib/auth';
import { recordEvent } from '@/lib/activity';

/**
 * Operations actions: fulfilment status and stock levels.
 *
 * Every one re-checks `isAdmin()` rather than trusting that middleware kept
 * strangers off the page. A server action is a POST to a route, and treating
 * "the page rendered" as proof of authorisation is how a matcher change turns
 * into an open endpoint for editing stock and order status.
 */

/** The states an operator may set, and what may follow what. */
const FULFILMENT_FLOW = {
  paid: ['fulfilled', 'cancelled'],
  fulfilled: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  pending: ['cancelled'],
  cancelled: [],
  refunded: [],
} as const satisfies Record<string, readonly string[]>;

export type OrderStatus = keyof typeof FULFILMENT_FLOW;

/** Which transitions the UI should offer for an order in this state. */
export async function allowedNextStatuses(current: string): Promise<readonly string[]> {
  return FULFILMENT_FLOW[current as OrderStatus] ?? [];
}

export type AdminActionResult = { ok: true } | { ok: false; error: string };

/**
 * Advances an order's fulfilment status.
 *
 * Transitions are checked against the flow above rather than accepting any
 * value the form posts. Without that, a stale tab could mark a cancelled order
 * shipped, and "delivered" could be set on something never paid for.
 *
 * Payment status is deliberately NOT settable here. It is owned by the
 * Razorpay webhook, which is the authoritative record of money; letting an
 * operator tick "paid" by hand would put the two out of step with no way to
 * tell which is right.
 */
export async function updateOrderStatus(formData: FormData): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!(await isAdmin())) return;

  const orderNumber = String(formData.get('orderNumber') ?? '');
  const next = String(formData.get('status') ?? '');
  if (!orderNumber || !next) return;

  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return;

  const allowed = FULFILMENT_FLOW[order.status as OrderStatus] ?? [];
  if (!allowed.includes(next as never)) return;

  await db
    .update(orders)
    .set({ status: next as typeof orders.$inferInsert.status, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  // Status changes are the audit trail for "where is my order".
  await recordEvent({
    name: 'admin.order_status_changed',
    props: { orderNumber, from: order.status, to: next },
  }).catch(() => {});

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderNumber}`);
}

/**
 * Sets the stock count for one product and size.
 *
 * An absolute value, not a delta. An operator counting a shelf knows how many
 * are there, not how many have changed since a number they never saw; a delta
 * form also double-applies if the page is submitted twice.
 */
export async function setStock(formData: FormData): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!(await isAdmin())) return;

  const productId = String(formData.get('productId') ?? '');
  const size = String(formData.get('size') ?? '');
  const raw = String(formData.get('quantity') ?? '');

  if (!productId || !size) return;

  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) return;

  await db
    .insert(inventory)
    .values({ productId, size, quantity })
    // Upsert, so a SKU with no row yet can be brought under stock control from
    // this screen instead of needing the seed script.
    .onConflictDoUpdate({
      target: [inventory.productId, inventory.size],
      set: { quantity, updatedAt: new Date() },
    });

  await recordEvent({
    name: 'admin.stock_set',
    props: { productId, size, quantity },
  }).catch(() => {});

  revalidatePath('/admin/inventory');
  revalidatePath('/admin');
}

/** Turns backorder on or off for a SKU. */
export async function setBackorder(formData: FormData): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!(await isAdmin())) return;

  const productId = String(formData.get('productId') ?? '');
  const size = String(formData.get('size') ?? '');
  const allow = formData.get('allow') === 'true';

  if (!productId || !size) return;

  await db
    .update(inventory)
    .set({ allowBackorder: allow, updatedAt: new Date() })
    .where(and(eq(inventory.productId, productId), eq(inventory.size, size)));

  revalidatePath('/admin/inventory');
}

/**
 * Ends the operator session.
 *
 * A server action rather than a form posting to /api/admin/logout, which
 * answers with JSON — a plain form post would leave the operator staring at
 * `{"ok":true}` instead of the sign-in page.
 */
export async function adminSignOut(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  redirect('/admin-login');
}
