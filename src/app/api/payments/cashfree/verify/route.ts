import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { getOrderByPaymentReference, markOrderPaid } from '@/lib/orders';
import { fetchCashfreePayments, getCashfreeConfig } from '@/lib/cashfree';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Called by the return page after Cashfree checkout. The browser's word is
 * not evidence: this asks Cashfree for the order's payments and applies a
 * successful one through the payment state machine, which also checks the
 * amount against the order total. The webhook remains authoritative; both
 * paths are idempotent.
 *
 * Answers `paid`, `pending` (nothing settled yet; the customer may retry or
 * the bank may still confirm) or `failed`. Unknown orders are 404.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const config = getCashfreeConfig();
  if (!config || !isDatabaseConfigured()) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });

  const limited = await limit([{ policy: 'payment', subject: { kind: 'ip', address: trustedClientIp(request.headers) } }]);
  if (!limited.allowed) return limitResponse(limited);

  const read = await readBoundedJson(request, BODY_LIMITS.paymentVerify);
  if (!read.ok) return read.response;
  const orderNumber = String((read.json as { orderNumber?: unknown } | undefined)?.orderNumber ?? '');
  if (!/^[A-Z0-9-]{4,40}$/.test(orderNumber)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const order = await getOrderByPaymentReference(orderNumber);
  if (!order || order.paymentProvider !== 'cashfree') return NextResponse.json({ error: 'Unknown order.' }, { status: 404 });
  if (order.paymentStatus === 'paid') return NextResponse.json({ status: 'paid', orderNumber });

  const payments = await fetchCashfreePayments(orderNumber, config);
  if (payments === null) return NextResponse.json({ status: 'pending', orderNumber, retry: true });

  const success = payments.find((p) => p.status === 'success');
  if (success) {
    const result = await markOrderPaid(order.id, success.id, success.amountPaise);
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Could not confirm payment.' }, { status: 409 });
    return NextResponse.json({ status: 'paid', orderNumber });
  }
  const settledFailure = payments.length > 0 && payments.every((p) => p.status === 'failed' || p.status === 'dropped');
  return NextResponse.json({ status: settledFailure ? 'failed' : 'pending', orderNumber });
}
