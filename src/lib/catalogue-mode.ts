/**
 * Which catalogue the site shows, and whether it may be ordered from.
 *
 * - `sample` (default): the development catalogue in `src/data/mock-data.ts`.
 *   Every product is labelled as a sample. Production builds refuse orders
 *   for it unless `ALLOW_SAMPLE_ORDERS=1` (a staging site with sandbox
 *   payments), so sample inventory is never sold as real stock.
 * - `verified`: only products onboarded from validated records
 *   (`src/data/verified-products.ts`). Empty until real products arrive; the
 *   storefront then shows honest empty states.
 *
 * `NEXT_PUBLIC_*` is read at build time: changing it needs a rebuild.
 */
export type CatalogueMode = 'sample' | 'verified';

export const CATALOGUE_MODE: CatalogueMode = process.env.NEXT_PUBLIC_CATALOGUE_MODE === 'verified' ? 'verified' : 'sample';
export const IS_SAMPLE_CATALOGUE = CATALOGUE_MODE === 'sample';

/** Server only: whether an order for sample products must be refused here. */
export function sampleOrdersBlocked(env: Record<string, string | undefined> = process.env): boolean {
  return IS_SAMPLE_CATALOGUE && env.NODE_ENV === 'production' && env.ALLOW_SAMPLE_ORDERS !== '1';
}

export const SAMPLE_ORDER_MESSAGE = 'This is a preview shop: the products shown are samples and cannot be ordered yet.';
