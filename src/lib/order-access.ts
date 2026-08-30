import { createSessionToken, verifySessionToken } from '@/lib/auth';

/**
 * Access control for order confirmation pages.
 *
 * `/orders/AVY-XXXXXX` previously rendered the customer's full name, street
 * address, phone number and email to anyone who had the URL. Order numbers
 * leak readily — browser history, referrer headers, support tickets, shared
 * screenshots — so "hard to guess" is not access control.
 *
 * Two ways in now:
 *
 *  - The signed-in customer who owns the order.
 *  - A guest holding a signed access token, issued at checkout and carried in
 *    the URL. The token is an HMAC over the order number, so it cannot be
 *    forged or transferred to a different order.
 *
 * Guests need the token because they have no account to authenticate against;
 * this is the same pattern order-status links in emails use.
 */

/** Long enough to follow up on an order, short enough to limit a leaked link. */
const TOKEN_TTL_NOTE = '30 days (inherited from the signing helper)';

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

/**
 * Issues an access token for an order number. Returns null when signing is not
 * configured, in which case the caller must fall back to requiring a session.
 */
export async function createOrderAccessToken(orderNumber: string): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  return createSessionToken(`order:${orderNumber}`, secret);
}

/** Verifies a token really was issued for this order number. */
export async function verifyOrderAccessToken(
  orderNumber: string,
  token: string | undefined
): Promise<boolean> {
  const secret = getSecret();
  if (!secret || !token) return false;
  const payload = await verifySessionToken(token, secret);
  // Binding the subject to the order number is what stops a token for one
  // order being replayed against another.
  return payload?.sub === `order:${orderNumber}`;
}

export { TOKEN_TTL_NOTE };
