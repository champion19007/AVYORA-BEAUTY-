import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { mergeCarts, ANONYMOUS_COOKIE } from '@/lib/cart-server';

/**
 * Issuing customer sessions outside the OAuth flow.
 *
 * Password and OTP sign-in cannot go through Auth.js's `signIn()`, because its
 * Credentials provider forces the JWT session strategy — and switching to JWT
 * would cost the one property that made database sessions worth their extra
 * query: a session can be revoked server-side by deleting its row. A stateless
 * token cannot be withdrawn until it expires, which for a shop that may need
 * to boot a compromised session is the wrong trade.
 *
 * So these flows create the session row directly. That is safe precisely
 * because the database strategy's cookie is not a signed token carrying
 * claims: it holds an opaque, random session id, and every request looks that
 * id up in `sessions` through the same adapter Auth.js uses. Writing the row
 * and setting the cookie is therefore the whole of what `signIn()` would have
 * done here — `auth()` reads these sessions with no idea they were made by us.
 *
 * The cookie name and attributes must match what Auth.js reads, or a session
 * created here is invisible to it. They are defined once, below.
 */

/** Ninety days, matching the `session.maxAge` configured in auth.ts. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;

/**
 * Auth.js prefixes the cookie with `__Secure-` when it is served over HTTPS,
 * and browsers reject that prefix on an insecure origin. Getting this wrong
 * produces a session that writes correctly and is then never read.
 */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
}

/**
 * Creates a session for a user and sets the cookie.
 *
 * Also folds in any anonymous cart, for the same reason the Google sign-in
 * event does: a basket filled before signing in must survive the sign-in.
 */
export async function createCustomerSession(userId: string): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({ sessionToken, userId, expires });

  const jar = await cookies();

  jar.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });

  // Never let a cart merge failure block a sign-in that already succeeded.
  try {
    const anonymousId = jar.get(ANONYMOUS_COOKIE)?.value;
    if (anonymousId) await mergeCarts(userId, anonymousId);
  } catch (err) {
    console.error('cart merge on sign-in failed (ignored)', err);
  }
}

/**
 * Ends the current session.
 *
 * Deletes the row as well as clearing the cookie: dropping only the cookie
 * would leave a valid session token alive in the database, so anyone who had
 * copied it would still be signed in.
 */
export async function destroyCustomerSession(): Promise<void> {
  const jar = await cookies();
  const name = sessionCookieName();
  const token = jar.get(name)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.sessionToken, token)).catch(() => {});
  }

  jar.set(name, '', { path: '/', maxAge: 0 });
}
