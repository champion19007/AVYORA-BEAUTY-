import { GST_RATE } from '@/lib/money';

/**
 * GST invoice data.
 *
 * Tax was being calculated and never turned into anything. Under Indian GST a
 * registered seller owes the customer a tax invoice, and owes the returns a
 * split that this codebase was not making: the same 18% is filed as CGST plus
 * SGST when the buyer is in your own state, and as a single IGST line when
 * they are not. The state is on every order — it simply was not being used.
 *
 * This module produces the numbers and the fields. It does not render a PDF;
 * the invoice is shown as a page the customer can print, which is a valid tax
 * invoice and avoids shipping a PDF toolchain into a serverless function.
 */

/**
 * The state you are registered in.
 *
 * Everything intra-state is CGST + SGST; everything else is IGST. Getting this
 * wrong does not change what the customer pays — it changes which heads the
 * tax is filed under, which is the part an audit looks at.
 */
export function sellerState(): string {
  return process.env.SELLER_STATE ?? 'Maharashtra';
}

export function sellerGstin(): string | null {
  return process.env.SELLER_GSTIN ?? null;
}

export type TaxSplit = {
  /** True when buyer and seller are in the same state. */
  intraState: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  /** The rate applied, as a percentage, for display. */
  ratePercent: number;
};

/**
 * Splits a tax amount into the heads it must be filed under.
 *
 * The halves are derived by halving and then taking the remainder, rather than
 * halving twice — an odd number of paise must not vanish. 101 paise becomes
 * 50 + 51, not 50 + 50.
 */
export function splitTax(taxPaise: number, buyerState: string | null | undefined): TaxSplit {
  const intraState =
    Boolean(buyerState) && buyerState!.trim().toLowerCase() === sellerState().trim().toLowerCase();

  if (!intraState) {
    return { intraState: false, cgst: 0, sgst: 0, igst: taxPaise, ratePercent: GST_RATE * 100 };
  }

  const cgst = Math.floor(taxPaise / 2);
  return {
    intraState: true,
    cgst,
    sgst: taxPaise - cgst,
    igst: 0,
    ratePercent: GST_RATE * 100,
  };
}

/**
 * HSN code for the goods.
 *
 * 3304 covers beauty and skin-care preparations. A single code is honest while
 * the catalogue is one category; the moment you sell something that is not a
 * cosmetic — a device, a supplement — this has to become per-product, because
 * a wrong HSN is the seller's liability, not the customer's.
 */
export const DEFAULT_HSN = '3304';

export type InvoiceLine = {
  productName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  hsn: string;
};

export type InvoiceData = {
  invoiceNumber: string;
  orderNumber: string;
  issuedOn: Date;
  seller: { name: string; gstin: string | null; state: string };
  buyer: { name: string; email: string; address: string[]; state: string | null };
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  /** Tax already contained in the total. */
  tax: number;
  taxableValue: number;
  split: TaxSplit;
  total: number;
  paid: boolean;
};

/**
 * Invoice number derived from the order number.
 *
 * GST requires a unique, sequential-per-series identifier. Deriving it from
 * the order number keeps the two trivially reconcilable and means an invoice
 * cannot be generated twice with different numbers — which a counter in the
 * application could easily do under concurrency.
 */
export function invoiceNumberFor(orderNumber: string): string {
  return `INV-${orderNumber.replace(/^AVY-/, '')}`;
}

/** Builds the invoice from an order. */
export function buildInvoice(order: {
  orderNumber: string;
  email: string;
  createdAt: Date;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  paymentStatus: string;
  shippingAddress: Record<string, string> | null;
  items: { productName: string; size: string; quantity: number; unitPrice: number; lineTotal: number }[];
}): InvoiceData {
  const address = order.shippingAddress ?? {};

  return {
    invoiceNumber: invoiceNumberFor(order.orderNumber),
    orderNumber: order.orderNumber,
    issuedOn: order.createdAt,
    seller: {
      name: process.env.SELLER_NAME ?? 'Avyora',
      gstin: sellerGstin(),
      state: sellerState(),
    },
    buyer: {
      name: address.fullName ?? '—',
      email: order.email,
      address: [
        [address.line1, address.line2].filter(Boolean).join(', '),
        [address.city, address.state, address.postalCode].filter(Boolean).join(' '),
        address.phone,
      ].filter(Boolean) as string[],
      state: address.state ?? null,
    },
    lines: order.items.map((i) => ({ ...i, hsn: DEFAULT_HSN })),
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    tax: order.tax,
    // Prices are tax-inclusive, so the taxable value is the total less the tax.
    taxableValue: order.total - order.tax,
    split: splitTax(order.tax, address.state),
    total: order.total,
    paid: order.paymentStatus === 'paid',
  };
}
