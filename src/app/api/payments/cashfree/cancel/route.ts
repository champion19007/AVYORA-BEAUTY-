import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { getOrderByPaymentReference } from '@/lib/orders';
import { fetchCashfreeOrder, getCashfreeConfig, terminateCashfreeOrder } from '@/lib/cashfree';
import { verifyOrderAccessToken } from '@/lib/order-access';
import { releaseIfUnpaid } from '@/lib/reservation-sweep';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { reportError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** Cashfree states after which no payment can ever succeed. */
const CLOSED = new Set(['TERMINATED', 'EXPIRED']);

/**
 * The customer left Cashfree without paying (back button, cancel, closed
 * the page and came back). Closes the attempt so nothing is ordered:
 *
 * 1. Ask Cashfree to terminate the payment order. It refuses while a payment
 *    is in progress (a UPI request awaiting approval), and then we wait:
 *    that payment may still succeed.
 * 2. Only once Cashfree reports TERMINATED or EXPIRED, cancel our order and
 *    return its stock. A payment that succeeded meanwhile is applied instead.
 *
 * Answers `paid`, `cancelled`, or `pending` (still open; the webhook or the
 * sweep finishes it). Requires the order's access token, issued to the
 * browser that started this checkout, so nobody can cancel someone else's
 * order by guessing its number. Idempotent.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const config = getCashfreeConfig();
  if (!config || !isDatabaseConfigured())
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });

  const limited = await limit([
    {
      policy: 'payment',
      subject: { kind: 'ip', address: trustedClientIp(request.headers) },
    },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const read = await readBoundedJson(request, BODY_LIMITS.paymentVerify);
  if (!read.ok) return read.response;
  const body = (read.json ?? {}) as { orderNumber?: unknown; token?: unknown };
  const orderNumber = String(body.orderNumber ?? '');
  if (!/^[A-Z0-9-]{4,40}$/.test(orderNumber)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!(await verifyOrderAccessToken(orderNumber, typeof body.token === 'string' ? body.token : undefined))) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 });
  }

  const order = await getOrderByPaymentReference(orderNumber);
  if (!order || order.paymentProvider !== 'cashfree')
    return NextResponse.json({ error: 'Unknown order.' }, { status: 404 });
  if (order.paymentStatus === 'paid') return NextResponse.json({ status: 'paid', orderNumber });
  if (order.status === 'cancelled') return NextResponse.json({ status: 'cancelled', orderNumber });

  try {
    let state = await terminateCashfreeOrder(orderNumber, config);
    if (!state || !CLOSED.has(state)) state = (await fetchCashfreeOrder(orderNumber, config))?.order_status ?? null;
    if (state === 'PAID') {
      const outcome = await releaseIfUnpaid(order.id);
      return NextResponse.json({
        status: outcome === 'paid' ? 'paid' : 'pending',
        orderNumber,
      });
    }
    if (!state || !CLOSED.has(state)) return NextResponse.json({ status: 'pending', orderNumber });

    const outcome = await releaseIfUnpaid(order.id);
    if (outcome === 'paid') return NextResponse.json({ status: 'paid', orderNumber });
    if (outcome === 'unknown') return NextResponse.json({ status: 'pending', orderNumber });
    return NextResponse.json({ status: 'cancelled', orderNumber });
  } catch (err) {
    reportError(err, { scope: 'cashfree.cancel', correlationId: orderNumber });
    return NextResponse.json({ status: 'pending', orderNumber });
  }
}
