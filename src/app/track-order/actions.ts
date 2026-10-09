'use server';

import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders } from '@/db/schema';
import { limit, limitMessage } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { orderProgress, type OrderProgress } from '@/lib/order-progress';
import { reportError } from '@/lib/observability';

/**
 * Looking up a real order.
 *
 * This replaces a page that invented its answer from the last digit of
 * whatever was typed — a customer entering a genuine order number was told a
 * fabricated status, and the page was linked from the main navigation.
 *
 * The lookup needs **both** the order number and the email it was placed with.
 * An order number alone is guessable, and the result carries the delivery
 * town — enough to confirm that a named person ordered from you. Requiring the
 * email makes it something only the customer already knows.
 */

export type TrackState = {
  error?: string;
  found?: {
    orderNumber: string;
    placedOn: string;
    progress: OrderProgress;
    /** Coarse location only — never the full address. */
    destination: string | null;
  };
};


export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Order tracking is not available on this deployment.' };
  }

  // Rate limited because this is a guessing surface: order numbers are short
  // and an unbounded endpoint invites enumeration.
  const orderNumber = String(formData.get('orderNumber') ?? '').trim().toUpperCase().slice(0, 40);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254);

  const limited = await limit([
    { policy: 'accountLookup', subject: { kind: 'ip', address: trustedClientIp(await headers()) } },
    { policy: 'accountLookup', subject: { kind: 'identifier', value: email || 'none' } },
  ]);
  if (!limited.allowed) return { error: limitMessage(limited) };

  if (!orderNumber) return { error: 'Enter your order number.' };
  if (!email) return { error: 'Enter the email you ordered with.' };

  // An outage is a recoverable message, never an error page that loses what was typed.
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      email: orders.email,
      status: orders.status,
      createdAt: orders.createdAt,
      shippingAddress: orders.shippingAddress,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)
    .catch((err) => {
      reportError(err, { scope: 'trackOrder' });
      return null;
    });
  if (!rows) return { error: 'Order tracking is briefly unavailable. Please try again in a minute.' };
  const [order] = rows;

  // One message whether the order does not exist or the email does not match.
  // Distinguishing them would confirm that an order number is real.
  if (!order || order.email.toLowerCase() !== email) {
    return { error: 'We could not find an order with those details.' };
  }

  const address = order.shippingAddress as Record<string, string> | null;

  return {
    found: {
      orderNumber: order.orderNumber,
      placedOn: order.createdAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      progress: orderProgress(order.status),
      destination: address?.city
        ? `${address.city}${address.state ? `, ${address.state}` : ''}`
        : null,
    },
  };
}
