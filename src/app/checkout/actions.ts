'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { createOrder, type CheckoutInput, type CreateOrderResult } from '@/lib/orders';
import { createOrderAccessToken } from '@/lib/order-access';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Places an order.
 *
 * Runs on the server so prices, totals and validation cannot be tampered with
 * from the browser. The signed-in user is read from the session rather than
 * taken from the request body, so an order cannot be attributed to someone else.
 */
export type PlaceOrderResult =
  | { ok: true; orderNumber: string; accessToken: string | null }
  | { ok: false; error: string };

export async function placeOrder(input: CheckoutInput): Promise<PlaceOrderResult> {
  // Server actions receive no Request object, so the address comes from the
  // incoming headers instead.
  const headerList = await headers();
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    'unknown';

  const limit = await rateLimit('checkout', ip);
  if (!limit.allowed) {
    return { ok: false, error: 'Too many orders from this connection. Please wait a moment.' };
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: 'Checkout is not available yet: this deployment has no database configured.',
    };
  }

  const session = await auth().catch(() => null);
  const result = await createOrder(input, session?.user?.id ?? null);
  if (!result.ok) return result;

  // Guests have no account to authenticate against, so they carry a signed
  // token that authorises this order and no other.
  const accessToken = await createOrderAccessToken(result.orderNumber);
  return { ok: true, orderNumber: result.orderNumber, accessToken };
}
