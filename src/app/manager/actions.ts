'use server';

import { revalidatePath } from 'next/cache';
import { revalidateProduct } from '@/lib/storefront-cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq, isNull } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders, inventory, restockRequests } from '@/db/schema';
import { SESSION_COOKIE } from '@/lib/auth';
import { getStaffSession } from '@/lib/staff-auth';
import { recordEvent } from '@/lib/activity';
import {
  adjustBatch as adjustBatchCommand,
  receiveStock as receiveStockCommand,
} from '@/modules/inventory/stock-commands';
import { bookCourier, recordDelivered } from '@/modules/shipping/shipments';
import { packingHold } from '@/modules/shipping/cod-policy';
import { recordAudit } from '@/modules/audit/audit';

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

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);

  if (!order) return;

  // Checked against the ladder, not taken from the form: a stale tab must not
  // be able to skip an order straight to delivered.
  const allowed = DISPATCH_FLOW[order.status as DispatchStatus] ?? [];
  if (!allowed.includes(next as never)) return;
  // A held order is not packed, whatever the page showed when it loaded.
  if (next === 'fulfilled' && packingHold(order)) return;

  await db
    .update(orders)
    .set({ status: next as typeof orders.$inferInsert.status, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  // Delivered by hand (no courier booking): cash on delivery was collected at the door.
  if (next === 'delivered') await recordDelivered(order.id);

  await recordEvent({
    name: 'admin.order_status_changed',
    props: { orderNumber, from: order.status, to: next, by: session.username, role: session.role },
  }).catch(() => {});

  revalidatePath('/manager');
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderNumber}`);
}

/**
 * Staff rang a cash-on-delivery customer, who still wants the order.
 *
 * The phone call is the fallback for a customer who never tapped the link in
 * their email; either way packing waits for a yes from the person paying.
 */
export async function confirmCodByPhone(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;
  const orderNumber = String(formData.get('orderNumber') ?? '');
  const confirmed = await db
    .update(orders)
    .set({ codConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.paymentProvider, 'cod'), isNull(orders.codConfirmedAt)))
    .returning({ id: orders.id });
  if (confirmed.length > 0) {
    await recordAudit({
      actor: session.username,
      actorRole: session.role,
      action: 'order.cod_confirmed',
      entityType: 'order',
      entityId: orderNumber,
      before: null,
      after: { by: 'phone' },
    }).catch(() => {});
  }
  revalidatePath('/manager');
  revalidatePath(`/admin/orders/${orderNumber}`);
}

/** Pages that render the batch forms; the only places a stock action may send someone back to. */
const STOCK_PAGES = ['/manager/stock', '/admin/inventory'] as const;

function backTo(formData: FormData, error?: string): never {
  const raw = String(formData.get('back') ?? '');
  const page = (STOCK_PAGES as readonly string[]).includes(raw) ? raw : STOCK_PAGES[0];
  redirect(error ? `${page}?error=${encodeURIComponent(error)}` : page);
}

async function afterStockChange(productId: string) {
  for (const page of STOCK_PAGES) revalidatePath(page);
  // The shelf just changed, and the shop shows the shelf.
  await revalidateProduct(productId);
}

/**
 * Records a delivery: a batch, its expiry, how many.
 *
 * Errors go back to the page as a message rather than failing silently: a
 * delivery the stockroom thinks they entered, and did not, is stock nobody
 * can sell.
 */
export async function receiveStockAction(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;

  const productId = String(formData.get('productId') ?? '');
  const result = await receiveStockCommand(
    {
      productId,
      size: String(formData.get('size') ?? ''),
      batchCode: String(formData.get('batchCode') ?? ''),
      expiresOn: String(formData.get('expiresOn') ?? ''),
      quantity: Number(String(formData.get('quantity') ?? '')),
    },
    { id: session.username, role: session.role }
  );
  if (!result.ok) backTo(formData, result.message);

  await afterStockChange(productId);
  backTo(formData);
}

/**
 * Adds to or removes from one batch: "-3, damaged", "+2, found behind the box".
 *
 * A delta, not an absolute. The person at the shelf knows what happened, not
 * the new total, and the database does the arithmetic so two people at once
 * cannot overwrite each other.
 */
export async function adjustBatchAction(formData: FormData): Promise<void> {
  const session = await requireManager();
  if (!session) return;

  const reason = String(formData.get('reason') ?? '').trim();
  const result = await adjustBatchCommand(
    {
      lotId: Number(String(formData.get('lotId') ?? '')),
      delta: Number(String(formData.get('delta') ?? '')),
      reason: reason || undefined,
    },
    { id: session.username, role: session.role }
  );
  if (!result.ok) backTo(formData, result.message);

  await afterStockChange(String(formData.get('productId') ?? ''));
  backTo(formData);
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
  const note =
    String(formData.get('note') ?? '')
      .trim()
      .slice(0, 500) || null;

  if (!productId || !size) return;
  if (!Number.isInteger(requested) || requested <= 0 || requested > 100_000) return;

  const [existing] = await db
    .select({ id: restockRequests.id })
    .from(restockRequests)
    .where(
      and(eq(restockRequests.productId, productId), eq(restockRequests.size, size), eq(restockRequests.status, 'open'))
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

export type CourierFormState = { error?: string; awb?: string };

/** Books a Shiprocket courier for a packed order. From then on the courier's updates move the order. */
export async function bookCourierAction(_prev: CourierFormState, formData: FormData): Promise<CourierFormState> {
  const session = await requireManager();
  if (!session) return { error: 'Your staff session has ended. Sign in again.' };
  const orderNumber = String(formData.get('orderNumber') ?? '');
  if (!orderNumber) return { error: 'Missing order.' };
  const result = await bookCourier(orderNumber, session);
  revalidatePath('/manager');
  revalidatePath(`/admin/orders/${orderNumber}`);
  return result.ok ? { awb: result.awb } : { error: result.error };
}
