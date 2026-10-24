import { GST_RATE } from '@/lib/money';

/**
 * The profit floor every price and offer must respect.
 *
 * A sale is profitable when, after taking out GST (prices are GST-inclusive)
 * and the payment provider's fee, what is left is at least the unit's cost
 * plus `floorPercent`. Pure and browser-safe: the admin preview and checkout
 * run the same rule.
 */
export type ProfitSettings = {
  /** Minimum profit over cost, in percent. 20 means "cost + 20%". */
  floorPercent: number;
  /** The payment provider's cut of the price, in percent. */
  paymentFeePercent: number;
};

export const DEFAULT_PROFIT_SETTINGS: ProfitSettings = { floorPercent: 20, paymentFeePercent: 2 };

/**
 * The lowest GST-inclusive price, in paise, at which one unit costing
 * `costPaise` still makes the floor. Rounded up, so it never undershoots.
 */
export function minProfitablePrice(costPaise: number, settings: ProfitSettings): number {
  const keepAfterFee = 1 - settings.paymentFeePercent / 100;
  return Math.ceil((costPaise * (1 + settings.floorPercent / 100) * (1 + GST_RATE)) / keepAfterFee);
}

/** True when selling one unit at `pricePaise` makes the floor. */
export function isProfitable(pricePaise: number, costPaise: number, settings: ProfitSettings): boolean {
  return pricePaise >= minProfitablePrice(costPaise, settings);
}

/**
 * How much discount a line can take, in paise, before it drops below the
 * floor. Zero when it is already at or below it. A line whose cost is
 * unknown can take none: without a cost, profit cannot be promised.
 */
export function discountRoom(
  line: { unitPrice: number; quantity: number; costPaise: number | null },
  settings: ProfitSettings
): number {
  if (line.costPaise === null) return 0;
  return Math.max(0, line.unitPrice - minProfitablePrice(line.costPaise, settings)) * line.quantity;
}
