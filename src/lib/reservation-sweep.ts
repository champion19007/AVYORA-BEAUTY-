import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders } from '@/db/schema';
import { restoreOrderStock } from '@/lib/orders';
import { reconcileOrder, type PaymentProviderClient, configuredProvider } from '@/modules/payments/reconciliation';
import { reportError } from '@/lib/observability';

/**
 * Releasing stock that nothing ever came back for.
 *
 * Cancellation and payment failure both restore stock now, but they are both
 * *events* — something has to happen for them to fire. The common case has no
 * event at all: a customer opens the Razorpay window, changes their mind and
 * closes the tab. No callback, no webhook, no cancellation. The order sits at
 * `pending` and its units sit reserved forever.
 *
 * That is the silent version of the bug the explicit triggers fixed, and it
 * needs a sweep rather than a handler: the absence of an event is not
 * something you can subscribe to.
 *
 * Cash on delivery is deliberately excluded. A COD order is unpaid by design
 * and may legitimately sit for days before dispatch; sweeping it would release
 * stock for parcels the stockroom is about to pack.
 */

/**
 * How long an online payment may stay unresolved.
 *
 * Razorpay sessions are short, and a customer who is still deciding after this
 * long has closed the tab. Long enough not to snatch stock from someone slowly
 * typing a card number; short enough that a busy shop is not holding phantom
 * reservations all day.
 */
export const RESERVATION_TTL_MINUTES = 30;

export type SweepResult = {
  examined: number;
  released: number;
  /** Found paid at the provider and applied instead of being cancelled. */
  recovered: number;
  /** The provider did not give a usable answer; left alone for next time. */
  undetermined: number;
};

/**
 * Releases reservations for online orders that were never paid.
 *
 * Idempotent by construction: `restoreOrderStock` claims each order with a
 * conditional update, so running this twice — or running it while a webhook
 * finally arrives — cannot credit the same units twice.
 */
export async function sweepAbandonedReservations(
  ttlMinutes = RESERVATION_TTL_MINUTES,
  provider: PaymentProviderClient | null = configuredProvider()
): Promise<SweepResult> {
  if (!isDatabaseConfigured()) return { examined: 0, released: 0, recovered: 0, undetermined: 0 };

  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

  const stale = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending'),
        // `failed` already released its stock when the failure was recorded.
        inArray(orders.paymentStatus, ['unpaid', 'pending']),
        // Online only. A COD order is unpaid on purpose.
        eq(orders.paymentProvider, 'razorpay'),
        // Not already swept.
        isNull(orders.stockRestoredAt),
        lt(orders.createdAt, cutoff)
      )
    )
    .limit(200);

  let released = 0;
  let recovered = 0;
  let undetermined = 0;

  for (const order of stale) {
    try {
      /*
       * Ask the provider first. Thirty minutes of silence from our side is not
       * evidence the customer did not pay: Razorpay retries webhooks for a day,
       * and a lost browser callback leaves no trace here at all. Releasing
       * first and being told later is how a paid order ended up cancelled.
       */
      const outcome = await reconcileOrder(order.id, provider);

      if (outcome === 'paid') {
        recovered += 1;
        continue;
      }
      if (outcome === 'unknown') {
        undetermined += 1;
        continue;
      }

      const restored = await restoreOrderStock(order.id);
      if (restored) {
        released += 1;
        await db
          .update(orders)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
    } catch (err) {
      // One bad order must not stop the sweep for the rest.
      reportError(err, {
        scope: 'reservationSweep',
        correlationId: order.orderNumber,
      });
    }
  }

  return { examined: stale.length, released, recovered, undetermined };
}
