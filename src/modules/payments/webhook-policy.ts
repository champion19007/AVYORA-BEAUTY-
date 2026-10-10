/*
 * Kept free of database imports so the rule can be tested, and loaded by the
 * webhook route, without pulling in the payment service.
 */
/**
 * Whether to ask the provider to redeliver an event for an order we do not have.
 *
 * Briefly, yes: the webhook can outrun our own checkout commit by moments.
 * But not forever. Some events will never find an order — a provider order
 * orphaned when our write failed after creating it, a test-mode payment, a
 * second integration on the same account — and a provider that keeps getting
 * errors eventually disables the webhook endpoint, taking every real payment
 * notification with it. Past the grace period the event is acknowledged and
 * reported for a person to look at, since money may have been taken.
 */
export const UNKNOWN_ORDER_GRACE_MS = 15 * 60 * 1000;

export function shouldRetryUnknownOrder(eventCreatedAtSeconds: number | null | undefined, now = Date.now()): boolean {
  // No timestamp to judge by: retry, and let the provider's own limit decide.
  if (typeof eventCreatedAtSeconds !== 'number' || !Number.isFinite(eventCreatedAtSeconds)) {
    return true;
  }
  return now - eventCreatedAtSeconds * 1000 < UNKNOWN_ORDER_GRACE_MS;
}
