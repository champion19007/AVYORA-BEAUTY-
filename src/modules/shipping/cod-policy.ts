import { toPaise } from '@/lib/money';

/**
 * Cash on delivery rules.
 *
 * A refused COD parcel costs the courier both ways and a product that may not
 * be resaleable, all before anyone learns there was no buyer. Three guards:
 * a ceiling on how much can be sent unpaid, a check that a courier takes cash
 * at the PIN code (lib/orders.ts), and the customer's confirmation before
 * anything is packed.
 */

/** The largest order total accepted as cash on delivery. ponytail: one figure; per-PIN-code limits if refusals cluster somewhere. */
export const COD_MAX_PAISE = toPaise(3000);

type Packable = {
  paymentProvider: string | null;
  paymentStatus: string;
  fraudStatus: string;
  attentionReason: string | null;
  codConfirmedAt: Date | null;
};

/**
 * Why an order may not be packed yet, or null when it may.
 *
 * The one rule for the owner's order page, the stockroom's queue and courier
 * booking, so none of them can let through what another would hold.
 */
export function packingHold(order: Packable): string | null {
  const cod = order.paymentProvider === 'cod';
  if (order.attentionReason) return 'The owner needs to decide what happens to this order before it is packed.';
  if (!cod && order.paymentStatus !== 'paid') return 'Not paid. Do not send; check with the owner.';
  if (order.fraudStatus === 'pending') return 'Risk check still running. Wait a moment and refresh.';
  if (order.fraudStatus !== 'approved') {
    return 'This cash-on-delivery order failed an automatic check. Confirm with the customer before packing.';
  }
  if (cod && !order.codConfirmedAt) {
    return 'Waiting for the customer to confirm. Call them, then mark it confirmed.';
  }
  return null;
}
