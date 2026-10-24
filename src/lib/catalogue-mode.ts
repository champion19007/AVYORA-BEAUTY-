import type { Product } from '@/data/mock-data';
import published from '@/data/catalogue.published.json';

/**
 * Which catalogue the site shows, and whether it may be ordered from.
 *
 * - `managed`: the products the owner published from the admin. Real
 *   products: no sample labels, orders open.
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
export type CatalogueMode = 'managed' | 'sample' | 'verified';

/**
 * The owner's published catalogue, or null before the first publish. The
 * file is committed as `null` and overwritten at build time from the
 * database by `scripts/export-catalogue.ts` (see "Publish to shop" in
 * /admin/products), so its products are compiled into the site like the
 * samples were, and every page reads them synchronously.
 */
/** `preview`: published to look at, not to sell; everything is labelled a sample and orders are refused. */
export type PublishedCatalogue = { publishedAt: string; preview?: boolean; products: Product[] };
export const PUBLISHED_CATALOGUE = published as unknown as PublishedCatalogue | null;

export const CATALOGUE_MODE: CatalogueMode = PUBLISHED_CATALOGUE
  ? 'managed'
  : process.env.NEXT_PUBLIC_CATALOGUE_MODE === 'verified'
    ? 'verified'
    : 'sample';
export const IS_SAMPLE_CATALOGUE = CATALOGUE_MODE === 'sample' || PUBLISHED_CATALOGUE?.preview === true;

/** In a preview nothing is for sale yet, so an unavailable product is "coming soon", not "sold out". */
export const IS_PREVIEW = PUBLISHED_CATALOGUE?.preview === true;
export const UNAVAILABLE_LABEL = IS_PREVIEW ? 'Coming soon' : 'Out of stock';

/** Server only: whether an order for sample products must be refused here. */
export function sampleOrdersBlocked(env: Record<string, string | undefined> = process.env): boolean {
  return IS_SAMPLE_CATALOGUE && env.NODE_ENV === 'production' && env.ALLOW_SAMPLE_ORDERS !== '1';
}

export const SAMPLE_ORDER_MESSAGE = 'This is a preview shop: the products shown are samples and cannot be ordered yet.';

/** The shopping pages (listing, product, compare and checkout) that carry the sample notice. */
const SHOP_PATHS = ['/collections', '/products', '/compare', '/checkout'];
export const isShopPath = (pathname: string) => SHOP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
