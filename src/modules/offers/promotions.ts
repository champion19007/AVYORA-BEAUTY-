import { formatPaise } from '@/lib/money';
import type { Offer } from './engine';

/**
 * What the shop tells customers about an offer: the badge on a product, the
 * explanation on its page, and the nudge in the bag. Only automatic offers
 * are shown; a coupon code is the owner's to hand out.
 *
 * Pure and browser-safe. The figures are the offer's terms, not a promise of
 * the final amount: checkout applies the single best offer and caps it at
 * the profit floor, and says so.
 */
export type Promotion = {
  id: string;
  name: string;
  kind: Offer['kind'];
  percentOff: number | null;
  amountPaise: number | null;
  buyQty: number | null;
  getQty: number | null;
  /** Null: every product. */
  productIds: string[] | null;
  minSubtotalPaise: number;
  minQuantity: number;
  firstOrderOnly: boolean;
  endsAt: string | null;
};

export const toPromotion = (o: Offer): Promotion => ({
  id: o.id,
  name: o.name,
  kind: o.kind,
  percentOff: o.percentOff,
  amountPaise: o.amountPaise,
  buyQty: o.buyQty,
  getQty: o.getQty,
  productIds: o.productIds?.length ? o.productIds : null,
  minSubtotalPaise: o.minSubtotalPaise,
  minQuantity: o.minQuantity,
  firstOrderOnly: o.firstOrderOnly,
  endsAt: o.endsAt?.toISOString() ?? null,
});

export const promotionCovers = (p: Promotion, productId: string) => !p.productIds || p.productIds.includes(productId);

/** Short, for a badge: "Buy 2, get 1 free". */
export function promotionBadge(p: Promotion): string {
  switch (p.kind) {
    case 'buy_x_get_y':
      return p.buyQty === p.getQty && p.buyQty === 1 ? 'Buy 1, get 1 free' : `Buy ${p.buyQty}, get ${p.getQty} free`;
    case 'percent_off':
      return `${p.percentOff}% off`;
    case 'amount_off':
      return `${formatPaise(p.amountPaise ?? 0)} off`;
    case 'free_delivery':
      return 'Free delivery';
  }
}

/** One or two sentences for the product page. */
export function promotionDetail(p: Promotion): string {
  const scope = p.productIds ? 'eligible products' : 'products';
  const conditions = [
    p.minSubtotalPaise > 0 ? `when you spend ${formatPaise(p.minSubtotalPaise)} or more on ${scope}` : null,
    p.minQuantity > 1 && p.kind !== 'buy_x_get_y' ? `when you buy ${p.minQuantity} or more ${scope}` : null,
    p.firstOrderOnly ? 'on your first order' : null,
  ].filter(Boolean);
  const when = conditions.length ? ` ${conditions.join(', ')}` : '';
  const ends = p.endsAt
    ? ` Ends ${new Date(p.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.`
    : '';
  switch (p.kind) {
    case 'buy_x_get_y': {
      const group = (p.buyQty ?? 0) + (p.getQty ?? 0);
      const free = p.getQty === 1 ? 'the lowest-priced one is' : `the ${p.getQty} lowest-priced are`;
      return `Add any ${group} ${scope} to your bag and ${free} free${when}. Mix and match.${ends}`;
    }
    case 'percent_off':
      return `${p.percentOff}% off ${scope}${when}.${ends}`;
    case 'amount_off':
      return `${formatPaise(p.amountPaise ?? 0)} off your order${when}.${ends}`;
    case 'free_delivery':
      return `Free delivery${when}.${ends}`;
  }
}

/** Where the bag stands against a promotion, in words, or null when nothing in the bag is eligible. */
export function bagProgress(
  p: Promotion,
  lines: { productId: string; quantity: number; unitPrice: number }[]
): { qualifies: boolean; message: string } | null {
  const eligible = lines.filter((l) => promotionCovers(p, l.productId));
  const units = eligible.reduce((n, l) => n + l.quantity, 0);
  if (units === 0) return null;
  const spend = eligible.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const label = promotionBadge(p);

  if (p.kind === 'buy_x_get_y') {
    const group = (p.buyQty ?? 0) + (p.getQty ?? 0);
    if (group < 2) return null;
    const groups = Math.floor(units / group);
    const missing = group - (units % group);
    if (groups === 0) {
      return {
        qualifies: false,
        message: `${label}: add ${missing} more eligible ${missing === 1 ? 'item' : 'items'} and the lowest-priced is free.`,
      };
    }
    const free = groups * (p.getQty ?? 0);
    return {
      qualifies: true,
      message: `${label}: ${free} ${free === 1 ? 'item is' : 'items are'} free at checkout.${
        missing < group ? ` Add ${missing} more for another free item.` : ''
      }`,
    };
  }
  if (spend < p.minSubtotalPaise) {
    return {
      qualifies: false,
      message: `${label}: spend ${formatPaise(p.minSubtotalPaise - spend)} more on eligible items.`,
    };
  }
  if (units < p.minQuantity) {
    const more = p.minQuantity - units;
    return { qualifies: false, message: `${label}: add ${more} more eligible ${more === 1 ? 'item' : 'items'}.` };
  }
  return { qualifies: true, message: `${label}: applied at checkout.` };
}
