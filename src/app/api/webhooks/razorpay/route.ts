import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { recordProviderEvent } from '@/modules/payments/payment-service';
import type { PaymentSignal } from '@/modules/payments/state-machine';
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
 *  - Delivery is at-least-once and unordered. Each delivery is recorded under
 *    Razorpay's own event id, so a repeat is recognised by a unique index
 *    rather than by reading the order first, and the payment state machine
 *    decides what an out-of-order event may change.
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

  /*
   * Razorpay's own id for this delivery. Retries of the same event carry the
   * same id, which is what makes the insert below a reliable duplicate check.
   * Should the header ever be missing, a hash of the signed body is the next
   * best identity: an identical body is an identical event.
   */
  const providerEventId =
    request.headers.get('x-razorpay-event-id') ?? `body:${await sha256Hex(rawBody)}`;

  const result = await recordProviderEvent({
    provider: 'razorpay',
    providerEventId,
    eventType: String(event.event ?? 'unknown'),
    providerOrderRef: razorpayOrderId,
    providerPaymentId: payment?.id ?? null,
    amount: typeof payment?.amount === 'number' ? payment.amount : null,
    payload: event,
    signal: signalFor(String(event.event ?? ''), payment),
  });

  if (result.status === 'unknown_order') {
    /*
     * Ask Razorpay to try again rather than acknowledging.
     *
     * The webhook can arrive before our own checkout transaction has
     * committed, so the order may be moments away from existing. The event is
     * deliberately not recorded here, so the retry is processed rather than
     * discarded as a duplicate.
     */
    console.error(`Webhook for unknown Razorpay order ${razorpayOrderId}, asking for retry`);
    return NextResponse.json({ error: 'Order not found yet.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, duplicate: result.status === 'duplicate' });
}

/**
 * What a Razorpay event means for an order, or null for events that mean
 * nothing here. Each event describes one payment attempt; the state machine
 * decides what that attempt means for the order as a whole.
 */
function signalFor(eventName: string, payment: any): PaymentSignal | null {
  const amount = typeof payment?.amount === 'number' ? payment.amount : undefined;

  switch (eventName) {
    case 'payment.captured':
    case 'order.paid':
      return typeof amount === 'number' ? { type: 'captured', amount } : null;
    case 'payment.authorized':
      return { type: 'authorized', amount };
    case 'payment.failed':
      return { type: 'failed' };
    case 'refund.processed':
      // Only a full refund moves the order. A partial one is recorded on the
      // event for the owner, and the order stays paid.
      return typeof amount === 'number' && Number(payment?.amount_refunded) >= amount
        ? { type: 'refunded' }
        : null;
    default:
      return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
