import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { fetchRazorpayOrderPayments, getRazorpayConfig } from '@/lib/razorpay';
import { applyPaymentSignal } from './payment-service';

/**
 * Asking the payment provider what actually happened.
 *
 * The case this exists for: the customer paid, and our side never heard. The
 * browser callback was lost with a closed tab, and the webhook is still in
 * Razorpay's retry queue — it retries for a day. Our own records say "unpaid".
 * Anything that acts on that (the abandonment sweep, a support agent) would
 * be acting on the absence of evidence.
 *
 * So there are four answers, not two, and "unknown" is its own outcome:
 *
 *   paid        the provider holds a captured payment; it has now been applied
 *   not_paid    the provider answered, and nothing was captured
 *   no_session  a payment window was never opened, so there is nothing to ask
 *   unknown     the provider did not answer, or holds an authorised payment
 *               that is not yet captured — leave the order alone and ask later
 *
 * Only `not_paid` and `no_session` justify releasing stock.
 */

export type ReconciliationResult = 'paid' | 'not_paid' | 'no_session' | 'unknown';

export type ProviderPayment = { id: string; amount: number; status: string };

/** What reconciliation needs from a payment provider. Faked in tests. */
export interface PaymentProviderClient {
  /** Payment attempts for a provider order id; null when unreachable. */
  listPayments(providerOrderRef: string): Promise<ProviderPayment[] | null>;
}

/** The configured provider, or null when online payment is not set up. */
export function configuredProvider(): PaymentProviderClient | null {
  const config = getRazorpayConfig();
  if (!config) return null;
  return {
    listPayments: (ref) => fetchRazorpayOrderPayments(ref, config),
  };
}

export async function reconcileOrder(
  orderId: string,
  provider: PaymentProviderClient | null = configuredProvider()
): Promise<ReconciliationResult> {
  const [order] = await db
    .select({ id: orders.id, reference: orders.paymentReference, total: orders.total })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return 'unknown';
  if (!order.reference) return 'no_session';

  /*
   * A reference with no way to ask about it. Online payment was configured
   * when the order was placed and has since been removed. Treat it as unknown
   * rather than unpaid: someone may well have paid.
   */
  if (!provider) return 'unknown';

  const payments = await provider.listPayments(order.reference);
  if (payments === null) return 'unknown';

  const captured = payments.find((p) => p.status === 'captured');
  if (captured) {
    await applyPaymentSignal(orderId, { type: 'captured', amount: captured.amount });
    return 'paid';
  }

  // Authorised but not yet captured: money is held, not yet ours. Wait.
  if (payments.some((p) => p.status === 'authorized')) return 'unknown';

  return 'not_paid';
}
