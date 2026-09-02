import { cookies } from 'next/headers';
import { SESSION_COOKIE, getAdminConfig, verifySessionToken } from '@/lib/auth';

/**
 * Server-side admin check.
 *
 * The middleware already redirects an unauthenticated visitor away from
 * `/admin`, so this is the second lock on the same door — and it is worth
 * having, because the two protect different things.
 *
 * Middleware guards *navigation*. Server actions are POSTs to a route, and a
 * page's data functions can be reached by React's own RSC requests; relying on
 * a single redirect rule to protect order records and stock levels means one
 * matcher edit away from exposing them. Every admin page and every admin
 * action calls this, so authorisation lives next to the data it protects
 * rather than in a routing table far away from it.
 *
 * Fails closed: no configuration, no cookie, or a bad signature all return
 * false.
 */
export async function isAdmin(): Promise<boolean> {
  const config = getAdminConfig();
  if (!config) return false;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const session = await verifySessionToken(token, config.sessionSecret);
  return Boolean(session);
}
