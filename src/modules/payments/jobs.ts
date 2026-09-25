import { enqueue, PermanentJobError } from '@/infrastructure/jobs/queue';
import type { Tx } from '@/infrastructure/idempotency/idempotency';
import { configuredProvider, reconcileOrder, type PaymentProviderClient } from './reconciliation';

/**
 * Asking the payment provider what happened, off the request path.
 *
 * The webhook is how a payment normally reaches us, and webhooks get lost:
 * a deploy at the wrong second, a provider outage, a misconfigured secret.
 * Every payment session therefore schedules one of these for twenty minutes
 * later. If the webhook arrived, the check finds the order already paid and
 * does nothing. If it did not, the check finds the captured payment and
 * applies it through the same state machine the webhook would have used.
 *
 * It never cancels anything. Releasing stock for an unpaid order stays the
 * reservation sweep's decision, made on its own schedule and rules.
 */

export const RECONCILE_JOB = 'payment.reconcile';
const DELAY_MS = 20 * 60 * 1000;

export async function scheduleReconciliation(orderId: string, tx?: Tx): Promise<void> {
  await enqueue(
    RECONCILE_JOB,
    { orderId },
    {
      tx,
      runAt: new Date(Date.now() + DELAY_MS),
      dedupeKey: `reconcile:${orderId}`,
      maxAttempts: 6,
    }
  );
}

export function reconcileJobHandler(provider: () => PaymentProviderClient | null = configuredProvider) {
  return async (payload: Record<string, unknown>) => {
    const orderId = String(payload.orderId ?? '');
    if (!orderId) throw new PermanentJobError('Missing orderId.');

    const client = provider();
    if (!client) throw new PermanentJobError('No payment provider is configured to ask.');

    const outcome = await reconcileOrder(orderId, client);
    // Unknown means "ask again later": the provider did not answer, or the
    // money is authorised but not yet captured. The queue's backoff paces it.
    if (outcome === 'unknown') throw new Error('Payment state not yet determinable; will ask again.');
  };
}
