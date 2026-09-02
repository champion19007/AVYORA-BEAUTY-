import { isOwner } from '@/lib/staff-auth';

/**
 * Server-side owner check.
 *
 * Kept as its own module so the many call sites in `/admin` did not all have
 * to change when roles arrived; it now simply defers to `staff-auth`.
 *
 * The middleware already redirects an unauthenticated visitor away from
 * `/admin`, so this is the second lock on the same door — and it is worth
 * having, because the two protect different things. Middleware guards
 * *navigation*. Server actions are POSTs to a route, and a page's data
 * functions can be reached by React's own RSC requests; relying on a single
 * redirect rule to protect order records and stock levels means one matcher
 * edit away from exposing them.
 *
 * Fails closed.
 */
export async function isAdmin(): Promise<boolean> {
  return isOwner();
}
