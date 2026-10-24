'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getOrderByNumber } from '@/lib/orders';
import { verifyOrderAccessToken } from '@/lib/order-access';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { cancelByCustomer, requestReturn } from '@/modules/returns/returns';

/**
 * The customer's own actions on an order.
 *
 * Authorised exactly like the order page: the signed-in account that placed
 * it, or a browser holding its signed access token. The order number alone
 * proves nothing.
 */
async function ownedOrder(formData: FormData) {
  const orderNumber = String(formData.get('orderNumber') ?? '');
  const token = String(formData.get('t') ?? '') || undefined;
  const order = orderNumber ? await getOrderByNumber(orderNumber) : null;
  if (!order) return null;
  const session = await auth().catch(() => null);
  const owns = Boolean(session?.user?.id && order.userId === session.user.id);
  if (!owns && !(await verifyOrderAccessToken(orderNumber, token))) return null;
  return { order, token };
}

function back(
  orderNumber: string,
  token: string | undefined,
  result: { ok: true } | { ok: false; error: string }
): never {
  const params = new URLSearchParams();
  if (token) params.set('t', token);
  if (result.ok) params.set('done', '1');
  else params.set('error', result.error);
  revalidatePath(`/orders/${orderNumber}`);
  redirect(`/orders/${encodeURIComponent(orderNumber)}?${params}#returns`);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const owned = await ownedOrder(formData);
  if (!owned) redirect('/track-order');
  if (formData.get('confirm') !== 'yes') {
    back(owned.order.orderNumber, owned.token, { ok: false, error: 'Tick the box to confirm the cancellation.' });
  }
  back(owned.order.orderNumber, owned.token, await cancelByCustomer(owned.order));
}

export async function requestReturnAction(formData: FormData): Promise<void> {
  const owned = await ownedOrder(formData);
  if (!owned) redirect('/track-order');
  const items = owned.order.items.map((item) => ({
    orderItemId: item.id,
    quantity: Number(String(formData.get(`qty-${item.id}`) ?? '0')) || 0,
  }));
  const result = await requestReturn(owned.order, {
    kind: String(formData.get('kind') ?? ''),
    items,
    note: String(formData.get('note') ?? ''),
    refundTo: String(formData.get('refundTo') ?? ''),
  });
  back(owned.order.orderNumber, owned.token, result);
}

/** A cash-on-delivery customer says yes, send it. Packing waits for this (modules/shipping/cod-policy). */
export async function confirmCodAction(formData: FormData): Promise<void> {
  const owned = await ownedOrder(formData);
  if (!owned) redirect('/track-order');
  const { order, token } = owned;
  if (order.paymentProvider !== 'cod' || order.status !== 'pending') {
    back(order.orderNumber, token, { ok: false, error: 'This order does not need confirming.' });
  }
  await db
    .update(orders)
    .set({ codConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), isNull(orders.codConfirmedAt)));
  revalidatePath('/manager');
  back(order.orderNumber, token, { ok: true });
}
