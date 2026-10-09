/**
 * Which responses a shared cache (the CDN, a proxy) may store.
 *
 * Public pages (home, collections, products, journal, policies) are static
 * or ISR and carry Next.js's own cache headers. Anything tied to a person
 * (account, checkout, orders, sign-in, staff consoles, the bag, wishlist,
 * payments) must never be stored by a shared cache, or one customer could be
 * served another's page. Next.js marks dynamic pages `no-store` itself; this
 * rule also covers a private page that accidentally became static and every
 * private API route, so isolation does not depend on how a page is rendered.
 *
 * Edge-safe: used by middleware.
 */

const PRIVATE_PREFIXES = [
  '/account',
  '/checkout',
  '/orders',
  '/login',
  '/signup',
  '/track-order',
  '/admin',
  '/admin-login',
  '/manager',
  '/api/cart',
  '/api/wishlist',
  '/api/account',
  '/api/auth',
  '/api/admin',
  '/api/payments',
  '/api/activity',
  '/api/routines',
  '/api/consent',
  '/api/support',
  '/api/scans',
  '/api/reviews',
  '/api/newsletter',
  '/newsletter',
  '/scan',
];

/** Pages that must never be indexed: everything private, plus personal or internal pages that are not cached privately. */
const NOINDEX_EXTRA = ['/wishlist', '/design-system'];
export function isNoIndexPath(path: string): boolean {
  return isPrivatePath(path) || NOINDEX_EXTRA.some((p) => path === p || path.startsWith(`${p}/`));
}

export const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
