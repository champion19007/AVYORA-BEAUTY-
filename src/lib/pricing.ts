import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { productPricing } from '@/db/schema';
import type { PricingRow } from '@/modules/catalog/sku-price';

/**
 * Owner-set prices and offers.
 *
 * The catalogue in `data/mock-data.ts` is compiled into the bundle, so
 * changing a price there is a code edit, a review and a redeploy — not
 * something a shop owner can do on a Friday evening because a competitor
 * dropped theirs. A row in `product_pricing` overrides the file for that
 * product and size.
 *
 * Everything here is integer paise. A price held as 12.99 in a float is a
 * rounding error waiting to become a wrong total.
 */

/*
 * The pricing rule itself lives in `modules/catalog/sku-price.ts`, which has
 * no database imports so the bag can run it in the browser. Re-exported here
 * for the existing callers.
 */
export { resolvePrice, type EffectivePrice, type PricingRow } from '@/modules/catalog/sku-price';

/** Every override, keyed `productId::size`. */
export async function pricingMap(): Promise<Map<string, PricingRow>> {
  const map = new Map<string, PricingRow>();
  if (!isDatabaseConfigured()) return map;

  const rows = await db.select().from(productPricing);
  for (const row of rows) map.set(`${row.productId}::${row.size}`, row);
  return map;
}

/** One override, or undefined. */
export async function getPricing(productId: string, size: string): Promise<PricingRow | undefined> {
  if (!isDatabaseConfigured()) return undefined;

  const [row] = await db
    .select()
    .from(productPricing)
    .where(and(eq(productPricing.productId, productId), eq(productPricing.size, size)))
    .limit(1);

  return row;
}

// Setting a price lives in `modules/catalog/pricing-commands.ts`, where it
// carries optimistic concurrency, an audit row and a domain event.
