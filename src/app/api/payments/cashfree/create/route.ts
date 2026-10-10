import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { orders } from '@/db/schema';
import { createOrder, findByIdempotencyKey, type CheckoutInput } from '@/lib/orders';
import { withIdempotency } from '@/infrastructure/idempotency/idempotency';
import { applyPaymentSignalInTx } from '@/modules/payments/payment-service';
import { scheduleReconciliation } from '@/modules/payments/jobs';
import { createCashfreeOrder, getCashfreeConfig } from '@/lib/cashfree';
import { createOrderAccessToken } from '@/lib/order-access';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { reportError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

type PaymentSession = { paymentSessionId: string; cashfreeOrderId: string };

/**
 * Creates our order, then the matching Cashfree order (Cashfree's order id
 * is our order number). The amount sent is the total this server computed.
 * A retried checkout returns the same order and the same payment session.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const config = getCashfreeConfig();
  if (!config || !isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Online payment is not available on this deployment.' }, { status: 503 });
  }

  const body = await readBoundedJson(request, BODY_LIMITS.paymentCreate);
  if (!body.ok) return body.response;
  if (!body.json || typeof body.json !== 'object')
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const input = body.json as CheckoutInput;

  const session = await auth().catch(() => null);
  const limited = await limit([
    { policy: 'payment', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
    session?.user?.id
      ? { policy: 'payment', subject: { kind: 'user', id: session.user.id } }
      : { policy: 'payment', subject: { kind: 'identifier', value: String(input.email ?? '') } },
  ]);
  if (!limited.allowed && !(input.idempotencyKey && (await findByIdempotencyKey(String(input.idempotencyKey))))) {
    return limitResponse(limited);
  }

  const created = await createOrder({ ...input, paymentMethod: 'cashfree' }, session?.user?.id ?? null);
  if (!created.ok) {
    return NextResponse.json(
      { error: created.error, code: created.code },
      { status: created.code === 'price_changed' ? 409 : 400 }
    );
  }

  try {
    // One Cashfree order per our order, however often this is called (see the Razorpay route for the reasoning).
    const { result } = await withIdempotency<PaymentSession>(
      {
        scope: 'payment.session',
        key: created.orderId,
        payload: { orderId: created.orderId, amountPaise: created.totalPaise },
        resource: (r) => ({ type: 'cashfree_order', id: r.cashfreeOrderId }),
      },
      async (tx) => {
        const origin = new URL(request.url).origin;
        const cf = await createCashfreeOrder(
          {
            orderNumber: created.orderNumber,
            amountPaise: created.totalPaise,
            customer: {
              // An opaque id: no email or phone in identifiers.
              id: session?.user?.id
                ? `u_${session.user.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`
                : `g_${created.orderNumber}`,
              email: input.email,
              phone: input.address.phone,
              name: input.address.fullName,
            },
            // Cashfree substitutes {order_id}; the return page asks our server what happened.
            returnUrl: `${origin}/checkout/return?order={order_id}`,
            notifyUrl: origin.startsWith('https://') ? `${origin}/api/webhooks/cashfree` : undefined,
          },
          config
        );
        await tx
          .update(orders)
          .set({ paymentReference: cf.order_id, updatedAt: new Date() })
          .where(eq(orders.id, created.orderId));
        await applyPaymentSignalInTx(tx, created.orderId, { type: 'session_opened' });
        await scheduleReconciliation(created.orderId, tx);
        return { paymentSessionId: cf.payment_session_id, cashfreeOrderId: cf.order_id };
      }
    );
    return NextResponse.json({
      paymentSessionId: result.paymentSessionId,
      mode: config.env,
      orderNumber: created.orderNumber,
      accessToken: await createOrderAccessToken(created.orderNumber),
    });
  } catch (err) {
    reportError(err, { scope: 'cashfree.createOrder', correlationId: created.orderNumber });
    return NextResponse.json({ error: 'We could not start the payment. Please try again.' }, { status: 502 });
  }
}
