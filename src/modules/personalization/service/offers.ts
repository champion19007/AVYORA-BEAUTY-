import { PRODUCTS } from '@/data/mock-data';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import type { Offer } from '@/modules/personalization/core/selection';

/**
 * Authoritative offers for selection, keyed by SKU (variant) id: the price
 * the customer would pay now (owner overrides and live offers applied, via
 * the shared pricing rule) and counted stock. Read fresh, not from the
 * display cache. A SKU with no stock count is `stock: null`, which selection
 * treats as not sellable, matching checkout. Server-only.
 */
export async function currentOffers(): Promise<Record<string, Offer>> {
  const [prices, stock] = await Promise.all([displayPrices({ fresh: true }), catalogueStock({ fresh: true })]);
  const offers: Record<string, Offer> = {};
  for (const v of catalogRecords(PRODUCTS).variants) {
    const price = prices[v.legacyStockKey]?.price;
    if (price === undefined) continue;
    offers[v.id] = { pricePaise: price, stock: stock[v.legacyStockKey] ?? null };
  }
  return offers;
}
