import type { Product } from '@/data/mock-data';
import { resolvePrice, type PricingRow } from '@/lib/pricing';
import { toPaise } from '@/lib/money';

/**
 * The price of one size of one product. One function, used by everyone.
 *
 * Checkout calls it with a pricing row read from Postgres on that request —
 * that is the authority, and what the customer is charged. The storefront calls
 * it with a row from the display cache. Same inputs, same rule, so the only way
 * the two can disagree is the cache being a few seconds old, which the display
 * policy bounds.
 *
 * Before this, they did not share a rule at all. Checkout charged the owner's
 * override; every page a customer saw showed the price compiled into the
 * catalogue. An owner raising a price from ₹649 to ₹799 left ₹649 on the product
 * page, the card and the checkout summary — and charged ₹799. An offer ran,
 * discounted every order, and was visible nowhere.
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

export function skuPrice(
  product: Pick<Product, 'price' | 'salePrice' | 'sizes'>,
  sizeLabel: string,
  row: PricingRow | undefined,
  now = new Date()
): SkuPrice {
  const size = product.sizes.find((s) => s.label === sizeLabel) ?? product.sizes[0];
  const cataloguePaise = toPaise(product.salePrice ?? size.price);

  if (row) {
    const effective = resolvePrice(cataloguePaise, row, now);
    return { price: effective.price, wasPrice: effective.wasPrice, offerLabel: effective.offerLabel };
  }

  // No override: the catalogue's own sale, if it has one, keeps its "was".
  return {
    price: cataloguePaise,
    wasPrice: product.salePrice ? toPaise(size.price) : null,
    offerLabel: null,
  };
}

/** `productId::size`, the key every price and stock map in the shop uses. */
export function skuKey(productId: string, size: string): string {
  return `${productId}::${size}`;
}
