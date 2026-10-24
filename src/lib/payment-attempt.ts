/**
 * The online payment attempt this browser has open, so that coming back
 * without paying (the back button, Cashfree's cancel, a closed tab reopened)
 * closes it: nothing is ordered and the stock is returned at once.
 *
 * Session storage, guarded: unavailable storage means the attempt is not
 * remembered, and the abandonment sweep releases it later instead.
 */
const KEY = 'avyora.payment-attempt';

export type PaymentAttempt = { orderNumber: string; token: string };
export type AttemptOutcome = 'paid' | 'cancelled' | 'pending' | 'error';

export function rememberAttempt(attempt: PaymentAttempt): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(attempt));
  } catch {
    /* storage unavailable */
  }
}

export function openAttempt(): PaymentAttempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return value && typeof value.orderNumber === 'string' && typeof value.token === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function forgetAttempt(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Asks the server to close an unpaid attempt. `pending`: a payment is still in progress. */
export async function closeAttempt(attempt: PaymentAttempt): Promise<AttemptOutcome> {
  try {
    const res = await fetch('/api/payments/cashfree/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt),
    });
    if (!res.ok) return 'error';
    const status = (await res.json())?.status;
    return status === 'paid' || status === 'cancelled' || status === 'pending' ? status : 'error';
  } catch {
    return 'error';
  }
}
