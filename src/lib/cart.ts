import { getProductById, getVariant } from '@/lib/catalogue';
import { skuKey, skuPrice, type SkuPrice } from '@/modules/catalog/sku-price';

/**
 * The bag, as data.
 *
 * A line is a SKU and a quantity — nothing else. It used to be a copy of the
 * whole catalogue product plus a quantity, and everything that displayed a line
 * priced it from that copy's base `price`. That is the 30ml price, frozen at
 * the moment of adding, so a 90ml line showed the 30ml amount, and no admin
 * price change or offer ever reached the bag. Prices are now looked up for the
 * line's SKU every time they are shown.
 *
 * Pure and browser-safe: no storage, no network. The store wraps these.
 */

export type CartLine = { productId: string; size: string; quantity: number };

/** Per-SKU purchase cap, from the specification (integer 1 through 10). */
export const MAX_QUANTITY_PER_SKU = 10;

/** Versioned, so a future shape change can migrate instead of misreading. */
export const CART_STORAGE_KEY = 'avyora.cart.v2';
/** The previous format: an array of whole products with a `selectedSize`. */
export const LEGACY_CART_STORAGE_KEY = 'cart';

export function isKnownSku(productId: string, size: string): boolean {
  return getVariant(productId, size) !== undefined;
}

function clampQuantity(n: number, max = MAX_QUANTITY_PER_SKU): number {
  return Math.max(0, Math.min(Math.floor(n), max));
}

/**
 * Reads whatever was stored into valid lines, dropping what cannot be trusted.
 *
 * Accepts the current `{ version: 2, lines }` shape and the legacy array. A
 * line survives only if its product and size exist in the catalogue and its
 * quantity is a positive integer; quantities are capped, and repeated SKUs
 * are merged. Anything else — malformed JSON already parsed to junk, a
 * product since withdrawn, a negative quantity — is discarded rather than
 * crashing the provider or being sent to checkout.
 */
export function normaliseLines(stored: unknown): CartLine[] {
  const raw: unknown[] = Array.isArray(stored)
    ? stored
    : stored &&
        typeof stored === 'object' &&
        (stored as { version?: unknown }).version === 2 &&
        Array.isArray((stored as { lines?: unknown }).lines)
      ? (stored as { lines: unknown[] }).lines
      : [];

  const merged = new Map<string, CartLine>();
  for (const entry of raw.slice(0, 100)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // Legacy lines were products: `id` and `selectedSize`.
    const productId = typeof e.productId === 'string' ? e.productId : typeof e.id === 'string' ? e.id : null;
    const size = typeof e.size === 'string' ? e.size : typeof e.selectedSize === 'string' ? e.selectedSize : null;
    const quantity = e.quantity;
    if (!productId || !size || !isKnownSku(productId, size)) continue;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) continue;

    const key = skuKey(productId, size);
    const sum = (merged.get(key)?.quantity ?? 0) + quantity;
    merged.set(key, { productId, size, quantity: clampQuantity(sum) });
  }
  return [...merged.values()];
}

export function serialiseLines(lines: CartLine[]): string {
  return JSON.stringify({ version: 2, lines });
}

export type AddResult = {
  lines: CartLine[];
  /** Units actually added; less than asked when a cap applied. */
  added: number;
  /** Why fewer were added, if they were. */
  limitedBy: 'stock' | 'per_sku_cap' | null;
};

/**
 * Adds `quantity` of one SKU, never more than `available` (when known) or
 * the per-SKU cap in total. An unknown SKU adds nothing: no other size is
 * substituted for it.
 */
export function addLine(
  lines: CartLine[],
  productId: string,
  size: string,
  quantity: number,
  available?: number
): AddResult {
  if (!isKnownSku(productId, size) || !Number.isInteger(quantity) || quantity < 1) {
    return { lines, added: 0, limitedBy: null };
  }

  const existing = lines.find((l) => l.productId === productId && l.size === size)?.quantity ?? 0;
  const stockCap = available === undefined ? Infinity : Math.max(0, Math.floor(available));
  const cap = Math.min(MAX_QUANTITY_PER_SKU, stockCap);
  const next = Math.min(existing + quantity, cap);
  const added = Math.max(0, next - existing);
  const limitedBy = added < quantity ? (stockCap < MAX_QUANTITY_PER_SKU ? 'stock' : 'per_sku_cap') : null;

  if (added === 0) return { lines, added: 0, limitedBy };

  const updated = existing
    ? lines.map((l) => (l.productId === productId && l.size === size ? { ...l, quantity: next } : l))
    : [...lines, { productId, size, quantity: next }];
  return { lines: updated, added, limitedBy };
}

/** Sets a line's quantity, between 1 and the per-SKU cap. Removal is separate. */
export function setLineQuantity(lines: CartLine[], productId: string, size: string, quantity: number): CartLine[] {
  const q = Math.max(1, clampQuantity(quantity));
  return lines.map((l) => (l.productId === productId && l.size === size ? { ...l, quantity: q } : l));
}

export function removeLine(lines: CartLine[], productId: string, size: string): CartLine[] {
  return lines.filter((l) => !(l.productId === productId && l.size === size));
}

export type LinePrice = SkuPrice & {
  /** False when no current quote covered this SKU and the catalogue price was used. */
  confirmed: boolean;
};

/**
 * One unit of a line, in paise: the current quote's price for exactly this
 * SKU, or — until a quote arrives — the catalogue price for this size,
 * marked unconfirmed. Never the product's base price.
 */
export function unitPrice(line: CartLine, quote?: Record<string, SkuPrice>): LinePrice {
  const quoted = quote?.[skuKey(line.productId, line.size)];
  if (quoted) return { ...quoted, confirmed: true };
  const product = getProductById(line.productId);
  if (!product) throw new Error(`Unknown product ${line.productId}`);
  return { ...skuPrice(product, line.size, undefined), confirmed: false };
}

/** Sum of every line at its unit price, in paise; and whether all were confirmed. */
export function subtotal(lines: CartLine[], quote?: Record<string, SkuPrice>): { paise: number; confirmed: boolean } {
  let paise = 0;
  let confirmed = true;
  for (const line of lines) {
    const unit = unitPrice(line, quote);
    paise += unit.price * line.quantity;
    confirmed &&= unit.confirmed;
  }
  return { paise, confirmed };
}

export type StockProblem = { productId: string; size: string; requested: number; available: number };

/**
 * Lines asking for more than is in stock, given a stock map. A SKU missing from
 * the map is uncounted, which checkout treats as unavailable (0).
 */
export function stockProblems(lines: CartLine[], stock: Record<string, number | undefined>): StockProblem[] {
  return lines.flatMap((l) => {
    const available = stock[skuKey(l.productId, l.size)] ?? 0;
    return l.quantity > available ? [{ ...l, requested: l.quantity, available }] : [];
  });
}
