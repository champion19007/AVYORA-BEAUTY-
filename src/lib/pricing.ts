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

export type SetPriceInput = {
  productId: string;
  size: string;
  /** Paise. */
  price: number;
  /** Paise, or null to end the offer. */
  salePrice: number | null;
  offerLabel: string | null;
  offerEndsAt: Date | null;
  updatedBy: string;
};

/**
 * Sets the price and offer for one SKU.
 *
 * Rejects a sale price that is not below the list price. An "offer" that costs
 * more than the normal price is either a typo or a dark pattern, and neither
 * should reach a customer.
 */
export async function setPricing(input: SetPriceInput): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(input.price) || input.price <= 0) {
    return { ok: false, error: 'Enter a price greater than zero.' };
  }

  if (input.salePrice !== null) {
    if (!Number.isInteger(input.salePrice) || input.salePrice <= 0) {
      return { ok: false, error: 'Enter an offer price greater than zero.' };
    }
    if (input.salePrice >= input.price) {
      return { ok: false, error: 'The offer price must be below the normal price.' };
    }
  }

  await db
    .insert(productPricing)
    .values({
      productId: input.productId,
      size: input.size,
      price: input.price,
      salePrice: input.salePrice,
      offerLabel: input.offerLabel,
      offerEndsAt: input.offerEndsAt,
      updatedBy: input.updatedBy,
    })
    .onConflictDoUpdate({
      target: [productPricing.productId, productPricing.size],
      set: {
        price: input.price,
        salePrice: input.salePrice,
        offerLabel: input.offerLabel,
        offerEndsAt: input.offerEndsAt,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}
