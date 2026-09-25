import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { productPricing } from '@/db/schema';

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

export type EffectivePrice = {
  /** What the customer pays, in paise. */
  price: number;
  /** The struck-out original, when an offer is running. */
  wasPrice: number | null;
  offerLabel: string | null;
  /** True when the price came from the database rather than the catalogue. */
  overridden: boolean;
};

export type PricingRow = typeof productPricing.$inferSelect;

/** Whether an offer is live right now, given its optional window. */
function offerActive(row: PricingRow, now: Date): boolean {
  if (row.salePrice === null) return false;
  // A sale price above the list price is a data error, not an offer.
  if (row.salePrice >= row.price) return false;
  if (row.offerStartsAt && row.offerStartsAt > now) return false;
  if (row.offerEndsAt && row.offerEndsAt <= now) return false;
  return true;
}

/**
 * Resolves what a SKU actually costs.
 *
 * `cataloguePrice` is the fallback, so a product with no override behaves
 * exactly as before.
 */
export function resolvePrice(
  cataloguePrice: number,
  row: PricingRow | undefined,
  now = new Date()
): EffectivePrice {
  if (!row) {
    return { price: cataloguePrice, wasPrice: null, offerLabel: null, overridden: false };
  }

  if (offerActive(row, now)) {
    return {
      price: row.salePrice!,
      wasPrice: row.price,
      offerLabel: row.offerLabel,
      overridden: true,
    };
  }

  return { price: row.price, wasPrice: null, offerLabel: null, overridden: true };
}

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
