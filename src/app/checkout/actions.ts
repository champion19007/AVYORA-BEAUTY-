'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { createOrder, type CheckoutInput, type CreateOrderResult } from '@/lib/orders';
import { createOrderAccessToken } from '@/lib/order-access';
import { limit, limitMessage } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { findByIdempotencyKey } from '@/lib/orders';

/**
 * Places an order.
 *
 * Runs on the server so prices, totals and validation cannot be tampered with
 * from the browser. The signed-in user is read from the session rather than
 * taken from the request body, so an order cannot be attributed to someone else.
 */
export type PlaceOrderResult =
  | { ok: true; orderNumber: string; accessToken: string | null }
  | { ok: false; error: string; code?: 'price_changed' };

export async function placeOrder(input: CheckoutInput): Promise<PlaceOrderResult> {
  // Server actions receive no Request object, so the address comes from the
  // incoming headers instead.
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: 'Checkout is not available yet: this deployment has no database configured.',
    };
  }

  const session = await auth().catch(() => null);
  const address = trustedClientIp(await headers());
  const email = typeof input?.email === 'string' ? input.email : '';
  const limited = await limit([
    { policy: 'checkout', subject: { kind: 'ip', address } },
    session?.user?.id
      ? { policy: 'checkout', subject: { kind: 'user', id: session.user.id } }
      : { policy: 'checkout', subject: { kind: 'identifier', value: email } },
  ]);
  if (!limited.allowed) {
    // A retry of an order that already exists is a replay, not new work:
    // answer it rather than refusing a customer whose order went through.
    const replay = input?.idempotencyKey ? await findByIdempotencyKey(String(input.idempotencyKey)) : null;
    if (!replay) return { ok: false, error: limitMessage(limited) };
  }

  const result = await createOrder(input, session?.user?.id ?? null);
  if (!result.ok) return result;

  // Guests have no account to authenticate against, so they carry a signed
  // token that authorises this order and no other.
  const accessToken = await createOrderAccessToken(result.orderNumber);
  return { ok: true, orderNumber: result.orderNumber, accessToken };
}
