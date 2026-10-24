import { FREE_SHIPPING_THRESHOLD_PAISE, STANDARD_SHIPPING_PAISE, formatPaise } from '@/lib/money';
import { discountRoom, minProfitablePrice, type ProfitSettings } from './profit';

/**
 * Offers: which one applies to a bag, and how much it takes off.
 *
 * Pure and browser-safe. Checkout calls it with prices and costs read from
 * Postgres on that request (the authority); the bag calls it to show the
 * saving before checkout. One offer per order: the best for the customer
 * among the automatic offers and the coupon they typed.
 *
 * Every discount is capped by the profit floor (profit.ts): a bag never
 * leaves checkout with less margin than the owner's floor, whatever offer
 * was configured or whatever has changed since it was saved.
 */

export const OFFER_KINDS = ['percent_off', 'amount_off', 'buy_x_get_y', 'free_delivery'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export type Offer = {
  id: string;
  name: string;
  kind: OfferKind;
  percentOff: number | null;
  amountPaise: number | null;
  buyQty: number | null;
  getQty: number | null;
  /** Null: every product. */
  productIds: string[] | null;
  minSubtotalPaise: number;
  minQuantity: number;
  couponCode: string | null;
  firstOrderOnly: boolean;
  maxUses: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

/** One bag line. Prices and costs are paise per unit. */
export type QuoteLine = {
  productId: string;
  size: string;
  unitPrice: number;
  quantity: number;
  /** Null when no cost price has been entered. */
  costPaise: number | null;
};

export type AppliedOffer = {
  offerId: string;
  name: string;
  couponCode: string | null;
  /** Taken off the items, in paise, after the profit cap. */
  itemDiscount: number;
  freeDelivery: boolean;
  /** True when the profit floor reduced what the offer would otherwise give. */
  capped: boolean;
  /** `itemDiscount` split across the bag's lines, in the order given; sums to it exactly. */
  lineDiscounts: number[];
};

export type QuoteContext = {
  lines: QuoteLine[];
  offers: Offer[];
  /** What the customer typed, if anything. Compared case-insensitively. */
  code?: string | null;
  isFirstOrder: boolean;
  /** Orders already placed with each offer, by offer id. */
  usage: Record<string, number>;
  settings: ProfitSettings;
  now?: Date;
};

export const normaliseCode = (code: string | null | undefined) => (code ?? '').trim().toUpperCase();

/**
 * Running, inside its dates and under its use limit. The limit is enforced
 * exactly when the order is written (lib/orders.ts, under a row lock); this
 * check only stops a used-up offer being shown or quoted.
 */
export function offerLive(offer: Offer, now: Date, used = 0): boolean {
  if (!offer.active) return false;
  if (offer.startsAt && offer.startsAt > now) return false;
  if (offer.endsAt && offer.endsAt <= now) return false;
  if (offer.maxUses !== null && used >= offer.maxUses) return false;
  return true;
}

const covers = (offer: Offer, productId: string) => !offer.productIds?.length || offer.productIds.includes(productId);

/** What the offer would take off before the profit cap, or null if the bag does not qualify. */
export function rawDiscount(offer: Offer, lines: QuoteLine[]): { item: number; freeDelivery: boolean } | null {
  const eligible = lines.filter((l) => covers(offer, l.productId) && l.quantity > 0);
  const subtotal = eligible.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const units = eligible.reduce((n, l) => n + l.quantity, 0);
  if (units === 0 || units < offer.minQuantity || subtotal < offer.minSubtotalPaise) return null;

  switch (offer.kind) {
    case 'percent_off':
      return { item: Math.floor((subtotal * (offer.percentOff ?? 0)) / 100), freeDelivery: false };
    case 'amount_off':
      return { item: Math.min(offer.amountPaise ?? 0, subtotal), freeDelivery: false };
    case 'buy_x_get_y': {
      const buy = offer.buyQty ?? 0;
      const get = offer.getQty ?? 0;
      if (buy < 1 || get < 1) return null;
      // Every unit, dearest first; in each full group the last `get` are free, so the cheapest go free.
      const prices = eligible.flatMap((l) => Array<number>(l.quantity).fill(l.unitPrice)).sort((a, b) => b - a);
      const group = buy + get;
      let item = 0;
      for (let start = 0; start + group <= prices.length; start += group) {
        for (let i = start + buy; i < start + group; i++) item += prices[i];
      }
      return item > 0 ? { item, freeDelivery: false } : null;
    }
    case 'free_delivery':
      return { item: 0, freeDelivery: true };
  }
}

/** Delivery the customer would pay on these lines after `itemDiscount`. */
export function deliveryCharge(lines: QuoteLine[], itemDiscount: number): number {
  const after = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) - itemDiscount;
  return after <= 0 || after >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : STANDARD_SHIPPING_PAISE;
}

/** The offer applied to this bag after the profit cap, with its value to the customer. */
function capped(offer: Offer, lines: QuoteLine[], settings: ProfitSettings): (AppliedOffer & { value: number }) | null {
  const raw = rawDiscount(offer, lines);
  if (!raw) return null;
  const room = lines.reduce((s, l) => s + discountRoom(l, settings), 0);
  const itemDiscount = Math.min(raw.item, room);
  // Waived delivery is paid by the shop, so it needs room too; it is all or nothing.
  const delivery = raw.freeDelivery ? deliveryCharge(lines, itemDiscount) : 0;
  const freeDelivery = raw.freeDelivery && delivery > 0 && room - itemDiscount >= delivery;
  const value = itemDiscount + (freeDelivery ? delivery : 0);
  if (value <= 0) return null;
  return {
    offerId: offer.id,
    name: offer.name,
    couponCode: offer.couponCode,
    itemDiscount,
    freeDelivery,
    capped: itemDiscount < raw.item || (raw.freeDelivery && !freeDelivery),
    lineDiscounts: allocateDiscount(
      itemDiscount,
      lineWeights(offer, lines),
      lines.map((l) => l.unitPrice * l.quantity)
    ),
    value,
  };
}

/** What each line would get under the offer before any cap, by the same rules as `rawDiscount`. */
function lineWeights(offer: Offer, lines: QuoteLine[]): number[] {
  const eligible = (l: QuoteLine) => covers(offer, l.productId) && l.quantity > 0;
  switch (offer.kind) {
    case 'percent_off':
      return lines.map((l) => (eligible(l) ? (l.unitPrice * l.quantity * (offer.percentOff ?? 0)) / 100 : 0));
    case 'amount_off':
      return lines.map((l) => (eligible(l) ? l.unitPrice * l.quantity : 0));
    case 'buy_x_get_y': {
      // The same free units as rawDiscount: dearest first, the last `get` of each full group.
      const units = lines
        .flatMap((l, i) => (eligible(l) ? Array.from({ length: l.quantity }, () => ({ i, price: l.unitPrice })) : []))
        .sort((a, b) => b.price - a.price);
      const weights = lines.map(() => 0);
      const buy = offer.buyQty ?? 0;
      const group = buy + (offer.getQty ?? 0);
      if (group < 2) return weights;
      for (let start = 0; start + group <= units.length; start += group) {
        for (let k = start + buy; k < start + group; k++) weights[units[k].i] += units[k].price;
      }
      return weights;
    }
    case 'free_delivery':
      return lines.map(() => 0);
  }
}

/**
 * Splits `total` paise across lines in proportion to `weights`, never more
 * than a line's own `limits`, by largest remainder so the shares add up to
 * `total` exactly. Zero weights get nothing.
 */
export function allocateDiscount(total: number, weights: number[], limits: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const shares = exact.map((x, i) => Math.min(Math.floor(x), limits[i]));
  let left = total - shares.reduce((a, b) => a + b, 0);
  // Hand out the remaining paise to the largest fractions first, within each line's limit.
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  while (left > 0) {
    let gave = false;
    for (const { i } of order) {
      if (left === 0) break;
      if (weights[i] > 0 && shares[i] < limits[i]) {
        shares[i] += 1;
        left -= 1;
        gave = true;
      }
    }
    if (!gave) break;
  }
  return shares;
}

export type QuoteResult = {
  applied: AppliedOffer | null;
  /** Set when the customer typed a code that did nothing, with the reason. */
  codeProblem: string | null;
};

/** The best offer for this bag. */
export function bestOffer(ctx: QuoteContext): QuoteResult {
  const now = ctx.now ?? new Date();
  const code = normaliseCode(ctx.code);
  const usable = (o: Offer) => offerLive(o, now, ctx.usage[o.id] ?? 0) && (!o.firstOrderOnly || ctx.isFirstOrder);

  const candidates = ctx.offers.filter((o) => (o.couponCode ? o.couponCode === code : true) && usable(o));
  let best: (AppliedOffer & { value: number }) | null = null;
  for (const offer of candidates) {
    const result = capped(offer, ctx.lines, ctx.settings);
    if (result && (!best || result.value > best.value)) best = result;
  }

  let codeProblem: string | null = null;
  if (code && best?.couponCode !== code) {
    const match = ctx.offers.find((o) => o.couponCode === code);
    if (!match || !offerLive(match, now, ctx.usage[match.id] ?? 0)) codeProblem = 'That code is not valid right now.';
    else if (match.firstOrderOnly && !ctx.isFirstOrder) codeProblem = 'That code is for a first order only.';
    else if (!rawDiscount(match, ctx.lines)) codeProblem = qualifyHint(match);
    else codeProblem = 'A better offer is already applied to your bag.';
  }

  if (!best) return { applied: null, codeProblem };
  return {
    applied: {
      offerId: best.offerId,
      name: best.name,
      couponCode: best.couponCode,
      itemDiscount: best.itemDiscount,
      freeDelivery: best.freeDelivery,
      capped: best.capped,
      lineDiscounts: best.lineDiscounts,
    },
    codeProblem,
  };
}

function qualifyHint(offer: Offer): string {
  const parts: string[] = [];
  if (offer.minSubtotalPaise > 0) parts.push(`spend ₹${Math.ceil(offer.minSubtotalPaise / 100)} on eligible items`);
  if (offer.minQuantity > 1) parts.push(`add ${offer.minQuantity} eligible items`);
  if (offer.kind === 'buy_x_get_y') parts.push(`add ${(offer.buyQty ?? 0) + (offer.getQty ?? 0)} eligible items`);
  return parts.length ? `To use this code, ${parts.join(' and ')}.` : 'Your bag does not qualify for this code.';
}

/* -------------------------------------------------------------------------- */
/* Checking an offer before it is saved                                        */
/* -------------------------------------------------------------------------- */

export type SkuForCheck = {
  productId: string;
  productName: string;
  size: string;
  price: number;
  costPaise: number | null;
};

/**
 * Problems that stop an offer being saved, worst case per SKU it covers.
 * Empty means every qualifying bag of a single product keeps the floor;
 * mixed bags are still capped at checkout.
 */
export function offerProblems(offer: Offer, skus: SkuForCheck[], settings: ProfitSettings): string[] {
  const problems: string[] = [];
  const covered = skus.filter((s) => covers(offer, s.productId));
  if (covered.length === 0) problems.push('The offer does not cover any product on sale.');

  for (const sku of covered) {
    const label = `${sku.productName} (${sku.size})`;
    if (sku.costPaise === null) {
      problems.push(`Add a cost price for ${label} first: without it, profit cannot be checked.`);
      continue;
    }
    const floor = minProfitablePrice(sku.costPaise, settings);
    const worst = worstUnitPrice(offer, sku.price);
    if (offer.kind === 'free_delivery') {
      const units = Math.max(offer.minQuantity, Math.ceil(offer.minSubtotalPaise / sku.price), 1);
      const room = (sku.price - floor) * units;
      if (sku.price * units < FREE_SHIPPING_THRESHOLD_PAISE && room < STANDARD_SHIPPING_PAISE) {
        problems.push(
          `Free delivery on ${label} would cost more than its margin. Raise the minimum spend to at least ₹${Math.ceil(
            minSpendForDelivery(sku.price, floor) / 100
          )}.`
        );
      }
    } else if (worst < floor) {
      problems.push(
        `${label} would sell at ${formatPaise(worst)}, below its floor of ${formatPaise(floor)}. ${limitHint(offer, sku.price, floor)}`
      );
    }
  }
  return problems;
}

/** The lowest price one unit can end up at under this offer, in a bag of just that product. */
function worstUnitPrice(offer: Offer, price: number): number {
  switch (offer.kind) {
    case 'percent_off':
      return Math.ceil((price * (100 - (offer.percentOff ?? 0))) / 100);
    case 'buy_x_get_y': {
      const buy = offer.buyQty ?? 0;
      const get = offer.getQty ?? 0;
      return buy + get > 0 ? Math.floor((price * buy) / (buy + get)) : price;
    }
    case 'amount_off': {
      // Spread over the smallest bag that qualifies.
      const units = Math.max(offer.minQuantity, Math.ceil(offer.minSubtotalPaise / price), 1);
      return Math.max(0, price - Math.ceil((offer.amountPaise ?? 0) / units));
    }
    case 'free_delivery':
      return price;
  }
}

function limitHint(offer: Offer, price: number, floor: number): string {
  const room = price - floor;
  if (room <= 0) return 'Its price is already at the floor: no discount is possible.';
  if (offer.kind === 'percent_off') return `The most you can give on it is ${Math.floor((room * 100) / price)}%.`;
  if (offer.kind === 'amount_off') return `Give less, or raise the minimum spend or quantity.`;
  return 'Ask customers to buy more before the free item.';
}

function minSpendForDelivery(price: number, floor: number): number {
  const room = price - floor;
  if (room <= 0) return FREE_SHIPPING_THRESHOLD_PAISE;
  return Math.min(FREE_SHIPPING_THRESHOLD_PAISE, Math.ceil(STANDARD_SHIPPING_PAISE / room) * price);
}
