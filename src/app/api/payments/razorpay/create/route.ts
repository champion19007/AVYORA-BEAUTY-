import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { createOrder, attachPaymentReference, type CheckoutInput } from '@/lib/orders';
import { createRazorpayOrder, getRazorpayConfig } from '@/lib/razorpay';
import { createOrderAccessToken } from '@/lib/order-access';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

/**
 * Creates our order, then a matching Razorpay order.
 *
 * Our order is persisted first so a payment can always be traced to something
 * real, and the amount sent to Razorpay is the total this server calculated —
 * never a figure supplied by the browser.
 */
export async function POST(request: Request) {
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
    const rzpOrder = await createRazorpayOrder(
      {
        amountPaise: created.totalPaise,
        receipt: created.orderNumber,
        notes: { orderNumber: created.orderNumber },
      },
      config
    );

    // Store the Razorpay order id so the webhook can resolve our order later.
    await attachPaymentReference(created.orderId, rzpOrder.id);

    return NextResponse.json({
      keyId: config.keyId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      orderNumber: created.orderNumber,
      accessToken: await createOrderAccessToken(created.orderNumber),
    });
  } catch (err) {
    // Log the detail, return something generic: provider errors can echo config.
    console.error('Razorpay order creation failed', err);
    return NextResponse.json(
      { error: 'We could not start the payment. Please try again.' },
      { status: 502 }
    );
  }
}
