/**
 * Guest-to-account merge policy for the bag and wishlist.
 *
 * Bag, per SKU (product + size, the stable identity from prompt 5):
 * - present in only one of the two: kept as it is;
 * - present in both: the **larger** quantity is kept, never the sum. A guest
 *   bag is often a copy of the account's own bag (signed out on the same
 *   device, or mirrored earlier), and summing would double it every time.
 *   Taking the larger is also idempotent: merging the same guest bag again,
 *   or retrying a merge, can never increase a quantity.
 * - then capped at the purchase limit and at counted stock; SKUs no longer
 *   sold are dropped. Every change is reported so the customer is told.
 *
 * Wishlist: the union, unknown products dropped, account order first.
 *
 * Pure: shared by the server merge and tests.
 */
import { getProductById, getVariant } from '@/lib/catalogue';
import { MAX_QUANTITY_PER_SKU, type CartLine } from '@/lib/cart';
import { skuKey } from '@/modules/catalog/sku-price';

export type MergeAdjustment = {
  productId: string;
  size: string;
  /** What the customer had (the larger of the two), and what they now have. */
  from: number;
  to: number;
  reason: 'kept_larger' | 'purchase_limit' | 'stock' | 'sold_out' | 'unavailable';
};

export type MergeResult = { lines: CartLine[]; adjustments: MergeAdjustment[] };

/** Stock by `skuKey`; a SKU missing from the map, or a null map, is not counted and not capped. */
export type StockMap = Readonly<Partial<Record<string, number>>> | null;

export const MAX_WISHLIST_ITEMS = 100;

export function mergeCartLines(account: readonly CartLine[], guest: readonly CartLine[], stock: StockMap = null): MergeResult {
  const byKey = new Map<string, { productId: string; size: string; account: number; guest: number }>();
  const add = (l: CartLine, side: 'account' | 'guest') => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) return;
    const key = skuKey(l.productId, l.size);
    const entry = byKey.get(key) ?? { productId: l.productId, size: l.size, account: 0, guest: 0 };
    entry[side] = Math.max(entry[side], l.quantity);
    byKey.set(key, entry);
  };
  account.forEach((l) => add(l, 'account'));
  guest.forEach((l) => add(l, 'guest'));

  const lines: CartLine[] = [];
  const adjustments: MergeAdjustment[] = [];
  // Account lines first, in their order, then lines only the guest had.
  for (const [key, e] of byKey) {
    const wanted = Math.max(e.account, e.guest);
    if (!getVariant(e.productId, e.size)) {
      adjustments.push({ productId: e.productId, size: e.size, from: wanted, to: 0, reason: 'unavailable' });
      continue;
    }
    if (e.account > 0 && e.guest > 0 && e.account !== e.guest) {
      adjustments.push({ productId: e.productId, size: e.size, from: Math.min(e.account, e.guest), to: wanted, reason: 'kept_larger' });
    }
    let quantity = wanted;
    if (quantity > MAX_QUANTITY_PER_SKU) {
      adjustments.push({ productId: e.productId, size: e.size, from: quantity, to: MAX_QUANTITY_PER_SKU, reason: 'purchase_limit' });
      quantity = MAX_QUANTITY_PER_SKU;
    }
    const available = stock?.[key];
    if (available !== undefined && quantity > available) {
      const to = Math.max(0, available);
      adjustments.push({ productId: e.productId, size: e.size, from: quantity, to, reason: to === 0 ? 'sold_out' : 'stock' });
      quantity = to;
    }
    if (quantity > 0) lines.push({ productId: e.productId, size: e.size, quantity });
  }
  return { lines, adjustments };
}

export function mergeWishlists(account: readonly string[], guest: readonly string[]): string[] {
  return [...new Set([...account, ...guest])].filter((id) => Boolean(getProductById(id))).slice(0, MAX_WISHLIST_ITEMS);
}

/** One sentence per adjustment, for the bag. */
export function describeAdjustment(a: MergeAdjustment): string {
  const name = getProductById(a.productId)?.name ?? 'An item';
  switch (a.reason) {
    case 'kept_larger':
      return `${name} (${a.size}) was in both bags; we kept ${a.to}.`;
    case 'purchase_limit':
      return `${name} (${a.size}) is limited to ${a.to} per order.`;
    case 'stock':
      return `Only ${a.to} of ${name} (${a.size}) is in stock, so your bag has ${a.to}.`;
    case 'sold_out':
      return `${name} (${a.size}) has sold out and was removed.`;
    case 'unavailable':
      return `${name} (${a.size}) is no longer sold and was removed.`;
  }
}
