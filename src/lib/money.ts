/**
 * Money handling.
 *
 * Every amount that touches the database or a payment provider is an integer
 * number of paise (1/100 of a rupee). Floating point cannot represent 0.1
 * exactly, so summing rupee floats drifts: a basket of ₹349.50 items reaches a
 * total that is a paisa or two out, and that discrepancy ends up in a payment
 * request or a customer's invoice.
 *
 * The catalogue currently quotes whole rupees, so conversion is exact today.
 * Keeping the boundary explicit means fractional prices will not break totals
 * later.
 */

/** Rupees (as used in the catalogue) to integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Integer paise back to rupees, for display only. */
export function toRupees(paise: number): number {
  return paise / 100;
}

/** Formats integer paise as an Indian-format currency string. */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(toRupees(paise));
}

/** Formats a whole-rupee catalogue price. */
export function formatRupees(rupees: number): string {
  return formatPaise(toPaise(rupees));
}

export type LineInput = { unitPrice: number; quantity: number };

/** Free shipping at or above this order value. */
export const FREE_SHIPPING_THRESHOLD_PAISE = toPaise(1199);
export const STANDARD_SHIPPING_PAISE = toPaise(79);

/**
 * GST on cosmetics in India is 18%, and catalogue prices are treated as
 * inclusive of it — which is what Indian customers expect to see. Tax is
 * therefore extracted from the total for the invoice rather than added on top.
 */
export const GST_RATE = 0.18;

export type OrderTotals = {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
};

/**
 * Computes order totals in paise.
 *
 * All arithmetic is integer. `tax` is the GST component already contained
 * within the total, shown for the invoice; it is not added again.
 */
export function calculateTotals(lines: LineInput[], discount = 0): OrderTotals {
  const subtotal = lines.reduce(
    (sum, l) => sum + toPaise(l.unitPrice) * l.quantity,
    0
  );

  const afterDiscount = Math.max(0, subtotal - discount);
  const shipping =
    afterDiscount === 0 || afterDiscount >= FREE_SHIPPING_THRESHOLD_PAISE
      ? 0
      : STANDARD_SHIPPING_PAISE;

  const total = afterDiscount + shipping;
  // Tax already included in `total`: total = net + net * rate.
  const tax = Math.round(total - total / (1 + GST_RATE));

  return { subtotal, discount: Math.min(discount, subtotal), shipping, tax, total };
}

/**
 * Human-facing order reference, e.g. AVY-7K2M4Q. Short enough to read aloud in
 * a support call, and not sequential, so it does not disclose order volume.
 */
export function generateOrderNumber(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `AVY-${out}`;
}
