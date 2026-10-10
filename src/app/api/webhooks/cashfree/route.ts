import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { recordProviderEvent } from '@/modules/payments/payment-service';
import { shouldRetryUnknownOrder } from '@/modules/payments/webhook-policy';
import type { PaymentSignal } from '@/modules/payments/state-machine';
import { getCashfreeConfig, normaliseStatus, toPaise, verifyCashfreeWebhook } from '@/lib/cashfree';
import { BODY_LIMITS, readBoundedText } from '@/lib/request-body';
import { reportError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/**
 * Cashfree payment webhook: the authoritative record of what was paid.
 *
 * Signature over the exact raw bytes (timestamp + body), never parsed first.
 * Deliveries are at-least-once and unordered: each is recorded once under a
 * stable id, and the payment state machine decides what it may change.
 */
export async function POST(request: Request) {
  const config = getCashfreeConfig();
  if (!config || !isDatabaseConfigured())
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });

  const read = await readBoundedText(request, BODY_LIMITS.paymentWebhook);
  if (!read.ok) return read.response;
  const rawBody = read.text;
  const timestamp = request.headers.get('x-webhook-timestamp') ?? '';
  const signature = request.headers.get('x-webhook-signature') ?? '';
  if (!(await verifyCashfreeWebhook(rawBody, timestamp, signature, config.secretKey))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: {
    type?: string;
    event_time?: string;
    data?: {
      order?: { order_id?: string };
      payment?: { cf_payment_id?: string | number; payment_amount?: number; payment_status?: string };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }
  const orderRef = event.data?.order?.order_id;
  const payment = event.data?.payment;
  if (!orderRef) return NextResponse.json({ ok: true, ignored: event.type ?? 'unknown' });

  const amount = typeof payment?.payment_amount === 'number' ? toPaise(payment.payment_amount) : null;
  const status = normaliseStatus(payment?.payment_status);
  const signal: PaymentSignal | null =
    status === 'success' && amount !== null
      ? { type: 'captured', amount }
      : status === 'failed'
        ? { type: 'failed' }
        : null;

  const result = await recordProviderEvent({
    provider: 'cashfree',
    // Stable per payment attempt and outcome, so a redelivery is recognised as a duplicate.
    providerEventId: `${event.type ?? 'event'}:${payment?.cf_payment_id ?? 'none'}:${payment?.payment_status ?? ''}`,
    eventType: String(event.type ?? 'unknown'),
    providerOrderRef: orderRef,
    providerPaymentId: payment?.cf_payment_id !== undefined ? String(payment.cf_payment_id) : null,
    amount,
    payload: event,
    signal,
  });

  if (result.status === 'unknown_order') {
    const at = event.event_time ? Date.parse(event.event_time) / 1000 : null;
    if (shouldRetryUnknownOrder(at && Number.isFinite(at) ? at : null))
      return NextResponse.json({ error: 'Order not found yet.' }, { status: 503 });
    reportError(new Error('Cashfree event for an order that does not exist'), {
      scope: 'webhook.cashfree.unknown_order',
      correlationId: orderRef,
    });
    return NextResponse.json({ ok: true, ignored: 'unknown_order' });
  }
  return NextResponse.json({ ok: true, duplicate: result.status === 'duplicate' });
}
