import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import {
  getOrderByPaymentReference,
  markOrderPaid,
  markOrderPaymentFailed,
} from '@/lib/orders';
import { getRazorpayConfig, verifyWebhookSignature } from '@/lib/razorpay';

/**
 * Razorpay webhook — the authoritative record of what was actually paid.
 *
 * The browser callback can be lost (closed tab, dead connection, customer on a
 * train), so the money must not depend on it. This endpoint is what guarantees
 * an order eventually reflects reality.
 *
 * Two details that are easy to get wrong:
 *
 *  - The body is read as raw text, because Razorpay signs the exact bytes it
 *    sent. Parsing and re-serialising changes them and every signature fails.
 *  - Delivery is at-least-once, so this must be idempotent. `markOrderPaid`
 *    returns early if the order is already paid.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const config = getRazorpayConfig();
  if (!config?.webhookSecret || !isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  const valid = await verifyWebhookSignature(rawBody, signature, config.webhookSecret);
  if (!valid) {
    // Do not say why. An attacker probing the endpoint learns nothing.
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const payment = event?.payload?.payment?.entity;
  const razorpayOrderId: string | undefined = payment?.order_id;

  if (!razorpayOrderId) {
    // Nothing actionable, but acknowledge so Razorpay stops retrying.
    return NextResponse.json({ ok: true, ignored: event?.event ?? 'unknown' });
  }

  const order = await getOrderByPaymentReference(razorpayOrderId);
  if (!order) {
    /*
     * Ask Razorpay to try again rather than acknowledging.
     *
     * This used to answer 200 on the reasoning that a retry would not make the
     * order appear. That is wrong in the one case that matters: the webhook can
     * arrive before our own checkout transaction has committed, so the order is
     * moments away from existing. Acknowledging then would strand a real
     * payment with no order ever marked paid, and nothing would ever revisit it.
     *
     * A 503 makes Razorpay redeliver on its own schedule. If the order is
     * genuinely unknown the retries eventually stop, and the logged line is
     * what someone investigates — which is the right outcome for money that
     * arrived with nothing to attach it to.
     */
    console.error(`Webhook for unknown Razorpay order ${razorpayOrderId} — asking for retry`);
    return NextResponse.json({ error: 'Order not found yet.' }, { status: 503 });
  }

  switch (event.event) {
    case 'payment.captured':
      await markOrderPaid(order.id, payment.id, payment.amount);
      break;
    case 'payment.failed':
      await markOrderPaymentFailed(order.id);
      break;
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
