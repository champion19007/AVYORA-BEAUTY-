import type { Product } from '@/data/mock-data';
import type { productPricing } from '@/db/schema';
import { toPaise } from '@/lib/money';

/**
 * The price of one size of one product. One function, used by everyone.
 *
 * Checkout calls it with a pricing row read from Postgres on that request —
 * that is the authority, and what the customer is charged. The storefront calls
 * it with a row from the display cache, and the bag with a row-less catalogue
 * fallback until the current quote arrives. Same inputs, same rule.
 *
 * Before this, they did not share a rule at all. Checkout charged the owner's
 * override; every page a customer saw showed the price compiled into the
 * catalogue. An owner raising a price from ₹649 to ₹799 left ₹649 on the product
 * page, the card and the checkout summary — and charged ₹799. An offer ran,
 * discounted every order, and was visible nowhere.
 *
 * No database imports, deliberately: the bag runs this in the browser. The
 * pricing row is a type only.
 *
 * All amounts are paise.
 */
export type SkuPrice = {
  /** What the customer pays. */
  price: number;
  /** The struck-out figure, when something is discounted. */
  wasPrice: number | null;
  offerLabel: string | null;
};

export type PricingRow = typeof productPricing.$inferSelect;

export type EffectivePrice = SkuPrice & {
  /** True when the price came from the database rather than the catalogue. */
  overridden: boolean;
};

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
 * Applies an owner override, if there is one, to a catalogue price.
 * `cataloguePrice` is the fallback, so a SKU with no override is unchanged.
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
    return { price: row.salePrice!, wasPrice: row.price, offerLabel: row.offerLabel, overridden: true };
  }
  return { price: row.price, wasPrice: null, offerLabel: null, overridden: true };
}

export function skuPrice(
  product: Pick<Product, 'id' | 'price' | 'salePrice' | 'sizes'>,
  sizeLabel: string,
  row: PricingRow | undefined,
  now = new Date()
): SkuPrice {
  /*
   * An unknown size is an error, not the first size. Falling back silently is
   * how a stale basket line for a withdrawn size used to be priced — and
   * charged — as a different variant.
   */
  const size = product.sizes.find((s) => s.label === sizeLabel);
  if (!size) throw new Error(`Unknown size "${sizeLabel}" for product ${product.id}`);

  /*
   * The catalogue's product-level `salePrice` describes the base size only
   * (`price` is that size's price). It used to apply to every size, so a sale
   * on the 30ml would also have priced the 90ml at the 30ml's sale price.
   */
  const onCatalogueSale = product.salePrice != null && size.price === product.price;
  const cataloguePaise = toPaise(onCatalogueSale ? product.salePrice! : size.price);

  if (row) {
    const effective = resolvePrice(cataloguePaise, row, now);
    return { price: effective.price, wasPrice: effective.wasPrice, offerLabel: effective.offerLabel };
  }

  // No override: the catalogue's own sale, if it has one, keeps its "was".
  return {
    price: cataloguePaise,
    wasPrice: onCatalogueSale ? toPaise(size.price) : null,
    offerLabel: null,
  };
}

/** `productId::size`, the key every price and stock map in the shop uses. */
export function skuKey(productId: string, size: string): string {
  return `${productId}::${size}`;
}
