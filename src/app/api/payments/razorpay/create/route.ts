import { NextResponse } from 'next/server';
import { reportError } from '@/lib/observability';
import { isSameOrigin } from '@/lib/security';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/db/schema';
import { createOrder, type CheckoutInput } from '@/lib/orders';
import { withIdempotency } from '@/infrastructure/idempotency/idempotency';
import { applyPaymentSignalInTx } from '@/modules/payments/payment-service';
import { scheduleReconciliation } from '@/modules/payments/jobs';
import { createRazorpayOrder, getRazorpayConfig } from '@/lib/razorpay';
import { createOrderAccessToken } from '@/lib/order-access';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

/** What a payment session returns, stored and replayed by the idempotency claim. */
type PaymentSession = { razorpayOrderId: string; amount: number; currency: string };

/**
 * Creates our order, then a matching Razorpay order.
 *
 * Our order is persisted first so a payment can always be traced to something
 * real, and the amount sent to Razorpay is the total this server calculated —
 * never a figure supplied by the browser.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const limit = await rateLimit('payment', clientIp(request));
  if (!limit.allowed) {
    return tooManyRequests(limit, 'Too many payment attempts. Please wait a moment.');
  }

  const config = getRazorpayConfig();
  if (!config || !isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Online payment is not available on this deployment.' },
      { status: 503 }
    );
  }

  let input: CheckoutInput;
  try {
    input = (await request.json()) as CheckoutInput;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const session = await auth().catch(() => null);
  const created = await createOrder(
    { ...input, paymentMethod: 'razorpay' },
    session?.user?.id ?? null
  );

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  try {
    /*
     * One Razorpay order per our order, however many times this is called.
     *
     * `createOrder` already returns the same order for a retried checkout, but
     * without this each retry would still open a fresh Razorpay order — a
     * double tap on "Pay" produced two payment windows for one purchase. The
     * idempotency claim is keyed on our order id and held in the same
     * transaction that records the Razorpay reference.
     *
     * The Razorpay call happens inside that transaction on purpose: a
     * concurrent duplicate waits on the claim and then receives the same
     * Razorpay order, rather than racing to create its own. The cost is a
     * database connection held for one provider round trip, which is the right
     * trade at this volume. If our write fails after Razorpay answers, the
     * orphaned Razorpay order simply expires unpaid.
     */
    const { result: session } = await withIdempotency<PaymentSession>(
      {
        scope: 'payment.session',
        key: created.orderId,
        payload: { orderId: created.orderId, amountPaise: created.totalPaise },
        resource: (r) => ({ type: 'razorpay_order', id: r.razorpayOrderId }),
      },
      async (tx) => {
        const rzpOrder = await createRazorpayOrder(
          {
            amountPaise: created.totalPaise,
            receipt: created.orderNumber,
            notes: { orderNumber: created.orderNumber },
          },
          config
        );

        await tx
          .update(orders)
          .set({ paymentReference: rzpOrder.id, updatedAt: new Date() })
          .where(eq(orders.id, created.orderId));

        await applyPaymentSignalInTx(tx, created.orderId, { type: 'session_opened' });
        // A later check with the provider, in case the webhook never arrives.
        // Same transaction: no session, no check; no check, no session.
        await scheduleReconciliation(created.orderId, tx);

        return {
          razorpayOrderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
        };
      }
    );

    return NextResponse.json({
      keyId: config.keyId,
      razorpayOrderId: session.razorpayOrderId,
      amount: session.amount,
      currency: session.currency,
      orderNumber: created.orderNumber,
      accessToken: await createOrderAccessToken(created.orderNumber),
    });
  } catch (err) {
    // Log the detail, return something generic: provider errors can echo config.
    reportError(err, { scope: 'razorpay.createOrder', correlationId: created.orderNumber });
    return NextResponse.json(
      { error: 'We could not start the payment. Please try again.' },
      { status: 502 }
    );
  }
}
