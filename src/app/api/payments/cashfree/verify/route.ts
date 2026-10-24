import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { getOrderByPaymentReference, markOrderPaid } from '@/lib/orders';
import { fetchCashfreePayments, getCashfreeConfig } from '@/lib/cashfree';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { auth } from '@/auth';
import { verifyOrderAccessToken } from '@/lib/order-access';

export const dynamic = 'force-dynamic';

/**
 * Called by the return page after Cashfree checkout. The browser's word is
 * not evidence: this asks Cashfree for the order's payments and applies a
 * successful one through the payment state machine, which also checks the
 * amount against the order total. The webhook remains authoritative; both
 * paths are idempotent.
 *
 * Answers `paid`, `pending` (an attempt is not settled yet; the bank may still
 * confirm), `failed`, or `not_started` (no payment was attempted: the customer
 * backed out). Unknown orders are 404. Without the order's access token (and
 * not signed in as its owner) every answer is `unverified`.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const config = getCashfreeConfig();
  if (!config || !isDatabaseConfigured())
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });

  const limited = await limit([
    { policy: 'payment', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const read = await readBoundedJson(request, BODY_LIMITS.paymentVerify);
  if (!read.ok) return read.response;
  const body = (read.json ?? {}) as { orderNumber?: unknown; token?: unknown };
  const orderNumber = String(body.orderNumber ?? '');
  if (!/^[A-Z0-9-]{4,40}$/.test(orderNumber)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  /*
   * Only the browser that started this checkout (it holds the order's access
   * token) or the signed-in owner of the order is told its status. Anyone
   * else gets the same answer whether the order exists or not, so order
   * numbers cannot be tested; the payment is still checked and applied.
   */
  const order = await getOrderByPaymentReference(orderNumber);
  const session = await auth().catch(() => null);
  const entitled =
    (await verifyOrderAccessToken(orderNumber, typeof body.token === 'string' ? body.token : undefined)) ||
    Boolean(order && session?.user?.id && order.userId === session.user.id);
  const reply = (payload: Record<string, unknown>, status = 200) =>
    entitled
      ? NextResponse.json({ ...payload, orderNumber }, { status })
      : NextResponse.json({ status: 'unverified', orderNumber });

  if (!order || order.paymentProvider !== 'cashfree') return reply({ error: 'Unknown order.' }, 404);
  if (order.paymentStatus === 'paid') return reply({ status: 'paid' });

  const payments = await fetchCashfreePayments(orderNumber, config);
  if (payments === null) return reply({ status: 'pending', retry: true });

  const success = payments.find((p) => p.status === 'success');
  if (success) {
    const result = await markOrderPaid(order.id, success.id, success.amountPaise);
    if (!result.ok) return reply({ error: result.error ?? 'Could not confirm payment.' }, 409);
    return reply({ status: 'paid' });
  }
  if (payments.length === 0) return reply({ status: 'not_started' });
  const settledFailure = payments.every((p) => p.status === 'failed' || p.status === 'dropped');
  return reply({ status: settledFailure ? 'failed' : 'pending' });
}
