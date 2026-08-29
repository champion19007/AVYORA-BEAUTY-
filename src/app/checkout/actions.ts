'use server';

import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { createOrder, type CheckoutInput, type CreateOrderResult } from '@/lib/orders';

/**
 * Places an order.
 *
 * Runs on the server so prices, totals and validation cannot be tampered with
 * from the browser. The signed-in user is read from the session rather than
 * taken from the request body, so an order cannot be attributed to someone else.
 */
export async function placeOrder(input: CheckoutInput): Promise<CreateOrderResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: 'Checkout is not available yet: this deployment has no database configured.',
    };
  }

  const session = await auth().catch(() => null);
  return createOrder(input, session?.user?.id ?? null);
}
