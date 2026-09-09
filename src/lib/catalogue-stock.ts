import { PRODUCTS } from '@/data/mock-data';
import { getStockMap } from '@/lib/inventory';
import type { StockByKey } from '@/components/product/product-card';

/**
 * Availability for every catalogue SKU, keyed `productId::size`.
 *
 * Shared by the homepage and the listing so the two cannot disagree — a
 * product showing as buyable on one and sold out on the other is worse than
 * either answer alone.
 *
 * Returns a plain object rather than the `Map` the inventory layer produces,
 * because this crosses the server/client boundary. `Infinity` for a backorder
 * SKU does not survive that trip either, so it becomes a large finite number:
 * the label only asks whether the count clears the low-stock threshold, and
 * any large number answers that identically.
 */
export async function stockForCatalogue(): Promise<StockByKey> {
  const map = await getStockMap(PRODUCTS.map((p) => p.id));

  const out: StockByKey = {};
  for (const [key, quantity] of map) {
    out[key] = Number.isFinite(quantity) ? quantity : Number.MAX_SAFE_INTEGER;
  }
  return out;
}
