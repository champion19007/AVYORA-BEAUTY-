export type CategoryOption = { id: string; label: string };
export const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'cleanser', label: 'Cleansers' },
  { id: 'serum', label: 'Serums' },
  { id: 'moisturizer', label: 'Moisturizers & SPF' },
];

export type PromotionForm = {
  name: string;
  currency: 'USD' | 'INR';
  categoryIds: string[];
  minimumSpend: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: string;
  maxDiscountPercent: string;
  preventCouponStacking: boolean;
  excludeSaleItems: boolean;
  startMode: 'immediately' | 'scheduled';
  startsAt: string;
  hasEnd: boolean;
  endsAt: string;
  timezone: 'Asia/Kolkata' | 'UTC';
};

export const INITIAL_PROMOTION: PromotionForm = {
  name: '',
  currency: 'USD',
  categoryIds: ['serum'],
  minimumSpend: '0',
  discountType: 'percentage',
  discountValue: '20',
  maxDiscountPercent: '50',
  preventCouponStacking: true,
  excludeSaleItems: true,
  startMode: 'immediately',
  startsAt: '',
  hasEnd: false,
  endsAt: '',
  timezone: 'Asia/Kolkata',
};

export type PromotionPayload = {
  schemaVersion: 1;
  name: string;
  currency: PromotionForm['currency'];
  conditions: {
    match: 'all';
    categoryIds: string[];
    minimumSpend: { amountMinor: number; basis: 'eligible_items_before_discounts_excluding_tax_and_shipping' };
  };
  reward:
    | { type: 'percentage'; basisPoints: number; appliesTo: 'each_eligible_unit' }
    | { type: 'fixed_amount'; amountMinor: number; appliesTo: 'each_eligible_unit' };
  safeguards: {
    preventCouponStacking: boolean;
    excludeSaleItems: boolean;
    maxDiscountBasisPoints: number;
    rounding: 'discount_down_to_minor_unit';
    otherPromotionPolicy: 'best_single_offer';
  };
  schedule: { startsAt: string | null; endsAt: string | null; timezone: PromotionForm['timezone']; endExclusive: true };
};

// Both supported currencies have two decimal places. Parse digits, not floating-point money.
export function parseHundredths(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function scheduledInstant(value: string, timezone: PromotionForm['timezone']): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = new Date(`${value}:00Z`);
  if (!Number.isFinite(wallTime.getTime()) || wallTime.toISOString().slice(0, 16) !== value) return null;
  // These zones have fixed offsets; browser timezone and daylight saving cannot change the result.
  return new Date(wallTime.getTime() - (timezone === 'Asia/Kolkata' ? 330 : 0) * 60_000).toISOString();
}

export function compilePromotion(form: PromotionForm, categories: CategoryOption[], now: number) {
  const errors: Partial<Record<keyof PromotionForm, string>> = {};
  if (!form.name.trim() || form.name.trim().length > 80) errors.name = 'Give this offer a name of 1–80 characters.';
  const known = new Set(categories.map((category) => category.id));
  if (!form.categoryIds.length || form.categoryIds.some((id) => !known.has(id))) {
    errors.categoryIds = 'Choose at least one available category.';
  }
  const minimum = parseHundredths(form.minimumSpend);
  const discount = parseHundredths(form.discountValue);
  const cap = parseHundredths(form.maxDiscountPercent);
  if (minimum === null || minimum > 100_000_000) errors.minimumSpend = 'Enter 0–1,000,000 with up to two decimals.';
  if (
    discount === null ||
    discount <= 0 ||
    (form.discountType === 'percentage' ? discount > 10_000 : discount > 100_000_000)
  ) {
    errors.discountValue =
      form.discountType === 'percentage'
        ? 'Enter a percentage above 0 and at most 100.'
        : 'Enter an amount above 0 and at most 1,000,000.';
  }
  if (cap === null || cap <= 0 || cap > 10_000)
    errors.maxDiscountPercent = 'Enter a safety limit above 0 and at most 100%.';
  if (form.discountType === 'percentage' && discount !== null && cap !== null && discount > cap) {
    errors.discountValue = 'The discount exceeds your safety limit. Lower it or deliberately raise the limit.';
  }
  const start = form.startMode === 'scheduled' ? scheduledInstant(form.startsAt, form.timezone) : null;
  const end = form.hasEnd ? scheduledInstant(form.endsAt, form.timezone) : null;
  if (form.startMode === 'scheduled' && (!start || Date.parse(start) <= now))
    errors.startsAt = 'Choose a start time in the future.';
  if (form.hasEnd && (!end || Date.parse(end) <= Math.max(now, start ? Date.parse(start) : now))) {
    errors.endsAt = 'Choose an end time after the start time and after now.';
  }
  if (Object.keys(errors).length) return { errors, payload: null };
  const payload: PromotionPayload = {
    schemaVersion: 1,
    name: form.name.trim(),
    currency: form.currency,
    conditions: {
      match: 'all',
      categoryIds: [...new Set(form.categoryIds)].sort(),
      minimumSpend: { amountMinor: minimum!, basis: 'eligible_items_before_discounts_excluding_tax_and_shipping' },
    },
    reward:
      form.discountType === 'percentage'
        ? { type: 'percentage', basisPoints: discount!, appliesTo: 'each_eligible_unit' }
        : { type: 'fixed_amount', amountMinor: discount!, appliesTo: 'each_eligible_unit' },
    safeguards: {
      preventCouponStacking: form.preventCouponStacking,
      excludeSaleItems: form.excludeSaleItems,
      maxDiscountBasisPoints: cap!,
      rounding: 'discount_down_to_minor_unit',
      otherPromotionPolicy: 'best_single_offer',
    },
    schedule: { startsAt: start, endsAt: end, timezone: form.timezone, endExclusive: true },
  };
  return { errors, payload };
}

export function previewPromotion(
  form: PromotionForm,
  sample: {
    categoryId: string;
    basePriceMinor: number;
    eligibleSpend: string;
    couponApplied: boolean;
    onSale: boolean;
  }
) {
  const discount = parseHundredths(form.discountValue);
  const cap = parseHundredths(form.maxDiscountPercent);
  const spend = parseHundredths(sample.eligibleSpend);
  const minimum = parseHundredths(form.minimumSpend);
  let reason = '';
  if (
    discount === null ||
    discount <= 0 ||
    cap === null ||
    cap <= 0 ||
    cap > 10_000 ||
    minimum === null ||
    minimum > 100_000_000 ||
    (form.discountType === 'percentage' ? discount > Math.min(cap, 10_000) : discount > 100_000_000)
  )
    reason = 'Enter a valid discount, spend threshold, and safety limit.';
  else if (!form.categoryIds.includes(sample.categoryId)) reason = 'This category is not included in the offer.';
  else if (spend === null || spend > 100_000_000) reason = 'Enter a valid sample spend, up to 1,000,000.';
  else if (spend < minimum) reason = 'The eligible spend is below your minimum.';
  else if (form.preventCouponStacking && sample.couponApplied)
    reason = 'A coupon is already applied. This offer cannot stack.';
  else if (form.excludeSaleItems && sample.onSale) reason = 'This item is already on sale and is excluded.';
  if (reason) return { priceMinor: sample.basePriceMinor, savingMinor: 0, reason, capped: false };
  const requested =
    form.discountType === 'percentage' ? Math.floor((sample.basePriceMinor * discount!) / 10_000) : discount!;
  const savingMinor = Math.min(requested, Math.floor((sample.basePriceMinor * cap!) / 10_000));
  return {
    priceMinor: sample.basePriceMinor - savingMinor,
    savingMinor,
    reason: savingMinor ? 'Offer applies to this sample.' : 'The discount rounds down to zero for this sample.',
    capped: savingMinor < requested,
  };
}
