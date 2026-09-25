import { PRODUCTS } from '@/data/mock-data';
import { isDatabaseConfigured } from '@/db';
import { pricingMap } from '@/lib/pricing';
import { getStockMap } from '@/lib/inventory';
import { cache, POLICIES } from '@/infrastructure/cache';
import { skuKey, skuPrice, type SkuPrice } from './sku-price';

/**
 * What the storefront shows: prices and availability, for display only.
 *
 * Both read through the cache (L1 → Redis → Postgres) under the display
 * policies, and both are invalidated by the events that change them. Neither
 * is ever consulted by checkout — checkout reads Postgres directly and
 * recomputes with the same `skuPrice` rule.
 *
 * Plain objects rather than Maps: these cross into client components and
 * through the JSON cache, and a Map survives neither.
 */

export type DisplayPrices = Record<string, SkuPrice>;
export type StockByKey = Record<string, number | undefined>;

/**
 * Every SKU's display price, in paise.
 *
 * `fresh` skips the cache. The checkout page uses it: that is the moment a
 * customer agrees to a total, and it costs one small query to make the figure
 * on screen exactly the one that will be charged, rather than one that may be
 * a few seconds behind an owner's edit.
 */
export async function displayPrices(options: { fresh?: boolean } = {}): Promise<DisplayPrices> {
  const compute = async (): Promise<DisplayPrices> => {
    const overrides = isDatabaseConfigured() ? await pricingMap() : new Map();
    const now = new Date();
    const out: DisplayPrices = {};
    for (const product of PRODUCTS) {
      for (const size of product.sizes) {
        const key = skuKey(product.id, size.label);
        out[key] = skuPrice(product, size.label, overrides.get(key), now);
      }
    }
    return out;
  };

  if (!isDatabaseConfigured() || options.fresh) return compute();
  return cache.getOrSet(POLICIES.pricingDisplay, 'all', compute);
}

/**
 * Availability for every SKU, keyed `productId::size`.
 *
 * `Infinity` (backorder) becomes a large finite number, because JSON cannot
 * carry Infinity. The label only asks whether the count clears the low-stock
 * threshold, and any large number answers that identically.
 */
export async function catalogueStock(): Promise<StockByKey> {
  if (!isDatabaseConfigured()) return {};

  return cache.getOrSet(POLICIES.availability, 'all', async () => {
    const map = await getStockMap(PRODUCTS.map((p) => p.id));
    const out: StockByKey = {};
    for (const [key, quantity] of map) {
      out[key] = Number.isFinite(quantity) ? quantity : Number.MAX_SAFE_INTEGER;
    }
    return out;
  });
}

/** Called when anything about a product's price or stock changes. */
export async function invalidateStorefrontData(): Promise<void> {
  await Promise.all([
    cache.invalidateNamespace(POLICIES.pricingDisplay),
    cache.invalidateNamespace(POLICIES.availability),
  ]);
}
