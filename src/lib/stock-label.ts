/**
 * Availability wording — deliberately free of database imports.
 *
 * The product page is a client component and needs this to label a size. When
 * it lived in `lib/inventory.ts` alongside the queries, importing it pulled
 * `db`, and with it the `postgres` driver, into the browser bundle — the same
 * failure the address schema hit, where the build could not resolve `tls`,
 * `fs` and `perf_hooks` for the client.
 *
 * Nothing here may import from `@/db`.
 */

/**
 * Human-readable availability for a storefront badge.
 *
 * `undefined` means no inventory row, which reads as out of stock rather than
 * in stock — matching `reserveStock`, which refuses to sell an uncounted SKU.
 * Promising "In stock" over a checkout that then declines is worse than a
 * plain refusal up front.
 *
 * `Infinity` is the backorder case: a SKU deliberately sold past zero.
 */
export function stockLabel(
  quantity: number | undefined,
  lowStockThreshold = 5
): { label: string; tone: 'in' | 'low' | 'out' } {
  if (quantity === Infinity) return { label: 'In stock', tone: 'in' };
  if (quantity === undefined) return { label: 'Out of stock', tone: 'out' };
  if (quantity <= 0) return { label: 'Out of stock', tone: 'out' };
  if (quantity <= lowStockThreshold) return { label: `Only ${quantity} left`, tone: 'low' };
  return { label: 'In stock', tone: 'in' };
}
