'use server';

import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';
import { orderProgress, type OrderProgress } from '@/lib/order-progress';

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

async function clientAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Order tracking is not available on this deployment.' };
  }

  // Rate limited because this is a guessing surface: order numbers are short
  // and an unbounded endpoint invites enumeration.
  const limit = await rateLimit('accountLookup', await clientAddress());
  if (!limit.allowed) {
    return { error: 'Too many lookups. Please wait a minute and try again.' };
  }

  const orderNumber = String(formData.get('orderNumber') ?? '').trim().toUpperCase();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!orderNumber) return { error: 'Enter your order number.' };
  if (!email) return { error: 'Enter the email you ordered with.' };

  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      email: orders.email,
      status: orders.status,
      createdAt: orders.createdAt,
      shippingAddress: orders.shippingAddress,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

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
