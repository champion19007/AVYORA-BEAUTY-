import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import {
  getOrderByPaymentReference,
  markOrderPaid,
  markOrderPaymentFailed,
} from '@/lib/orders';
import {
  fetchRazorpayPayment,
  getRazorpayConfig,
  verifyPaymentSignature,
} from '@/lib/razorpay';

/**
 * Verifies the handshake Razorpay Checkout returns to the browser.
 *
 * The browser saying "payment succeeded" proves nothing — anyone can POST that.
 * The signature is checked against our key secret, and the captured amount is
 * re-read from Razorpay and compared with the order total, so a tampered or
 * partial payment cannot mark an order paid.
 *
 * This is a convenience so the customer sees confirmation immediately. The
 * webhook remains the authoritative record, and both paths are idempotent.
 */
export async function POST(request: Request) {
  const config = getRazorpayConfig();
  if (!config || !isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  }

  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const orderId = body.razorpay_order_id ?? '';
  const paymentId = body.razorpay_payment_id ?? '';
  const signature = body.razorpay_signature ?? '';

  const valid = await verifyPaymentSignature(
    { orderId, paymentId, signature },
    config.keySecret
  );

  const order = await getOrderByPaymentReference(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Unknown order.' }, { status: 404 });
  }

  if (!valid) {
    await markOrderPaymentFailed(order.id);
    return NextResponse.json({ error: 'Payment verification failed.' }, { status: 400 });
  }

  // Confirm the amount with Razorpay rather than trusting the callback.
  const payment = await fetchRazorpayPayment(paymentId, config);
  if (!payment || (payment.status !== 'captured' && payment.status !== 'authorized')) {
    return NextResponse.json({ error: 'Payment not completed.' }, { status: 400 });
  }

  const result = await markOrderPaid(order.id, paymentId, payment.amount);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Could not confirm payment.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, orderNumber: order.orderNumber });
}
