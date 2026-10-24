import { describe, expect, it } from 'vitest';
import {
  compilePromotion,
  DEFAULT_CATEGORIES,
  INITIAL_PROMOTION,
  parseHundredths,
  previewPromotion,
  scheduledInstant,
  type PromotionForm,
} from '../promotion-model';

const now = Date.parse('2026-10-20T10:00:00Z');
const form = (changes: Partial<PromotionForm> = {}): PromotionForm => ({
  ...INITIAL_PROMOTION,
  name: 'Serum offer',
  ...changes,
});
const sample = { categoryId: 'serum', basePriceMinor: 5000, eligibleSpend: '50', couponApplied: false, onSale: false };

describe('promotion money and eligibility', () => {
  it('shows $50 reduced to $40 for a 20% offer', () => {
    expect(previewPromotion(form(), sample)).toMatchObject({ priceMinor: 4000, savingMinor: 1000 });
  });
  it('parses decimal money without binary floating-point drift', () => {
    expect(parseHundredths('0.29')).toBe(29);
    expect(parseHundredths('50.5')).toBe(5050);
    for (const value of ['', '-1', 'NaN', 'Infinity', '1e3', '0.001', ' 50', '10000000'])
      expect(parseHundredths(value)).toBeNull();
  });
  it('floors fractional minor-unit discounts', () => {
    expect(previewPromotion(form({ discountValue: '33.33' }), { ...sample, basePriceMinor: 101 })).toMatchObject({
      priceMinor: 68,
      savingMinor: 33,
    });
  });
  it('caps a fixed discount per item and never produces negative prices', () => {
    expect(previewPromotion(form({ discountType: 'fixed_amount', discountValue: '100' }), sample)).toMatchObject({
      priceMinor: 2500,
      savingMinor: 2500,
      capped: true,
    });
    expect(
      previewPromotion(form({ discountType: 'fixed_amount', discountValue: '100', maxDiscountPercent: '100' }), sample)
    ).toMatchObject({ priceMinor: 0 });
  });
  it('requires category AND eligible spend; the exact minimum qualifies', () => {
    const rule = form({ minimumSpend: '50' });
    expect(previewPromotion(rule, { ...sample, categoryId: 'cleanser' }).savingMinor).toBe(0);
    expect(previewPromotion(rule, { ...sample, eligibleSpend: '49.99' }).savingMinor).toBe(0);
    expect(previewPromotion(rule, sample).savingMinor).toBe(1000);
  });
  it('applies stacking and sale-item guards independently', () => {
    expect(previewPromotion(form(), { ...sample, couponApplied: true }).savingMinor).toBe(0);
    expect(
      previewPromotion(form({ preventCouponStacking: false }), { ...sample, couponApplied: true }).savingMinor
    ).toBe(1000);
    expect(previewPromotion(form(), { ...sample, onSale: true }).savingMinor).toBe(0);
    expect(previewPromotion(form({ excludeSaleItems: false }), { ...sample, onSale: true }).savingMinor).toBe(1000);
  });
  it('does not display a discount for malformed or unsafe inputs', () => {
    for (const change of [
      { discountValue: '' },
      { discountValue: '60' },
      { maxDiscountPercent: '101' },
      { minimumSpend: '1000001' },
    ]) {
      expect(previewPromotion(form(change), sample).savingMinor).toBe(0);
    }
  });
});

describe('promotion API contract', () => {
  it('exports trimmed names, stable categories and integer amounts', () => {
    const { payload } = compilePromotion(
      form({ name: '  Serum offer  ', minimumSpend: '100.29', categoryIds: ['serum', 'cleanser', 'serum'] }),
      DEFAULT_CATEGORIES,
      now
    );
    expect(payload).toMatchObject({
      schemaVersion: 1,
      name: 'Serum offer',
      currency: 'USD',
      conditions: { match: 'all', categoryIds: ['cleanser', 'serum'], minimumSpend: { amountMinor: 10029 } },
      reward: { type: 'percentage', basisPoints: 2000 },
      schedule: { startsAt: null, endsAt: null },
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
  it('exports fixed rupee discounts in paise', () => {
    const { payload } = compilePromotion(
      form({ currency: 'INR', discountType: 'fixed_amount', discountValue: '10.29' }),
      DEFAULT_CATEGORIES,
      now
    );
    expect(payload?.reward).toEqual({ type: 'fixed_amount', amountMinor: 1029, appliesTo: 'each_eligible_unit' });
  });
  it('rejects empty names, unavailable categories and invalid discounts', () => {
    for (const change of [
      { name: ' ' },
      { categoryIds: [] },
      { categoryIds: ['unknown'] },
      { discountValue: '-20' },
      { discountValue: '60' },
      { maxDiscountPercent: '0' },
    ]) {
      expect(compilePromotion(form(change), DEFAULT_CATEGORIES, now).payload).toBeNull();
    }
  });
  it('converts IST to UTC regardless of the runtime timezone', () => {
    expect(scheduledInstant('2026-10-21T10:30', 'Asia/Kolkata')).toBe('2026-10-21T05:00:00.000Z');
    expect(scheduledInstant('2026-10-21T10:30', 'UTC')).toBe('2026-10-21T10:30:00.000Z');
    expect(scheduledInstant('2026-02-30T10:30', 'UTC')).toBeNull();
  });
  it('rejects past starts, missing times, reversed windows and expired ends', () => {
    for (const change of [
      { startMode: 'scheduled' as const, startsAt: '' },
      { startMode: 'scheduled' as const, startsAt: '2026-10-19T10:30' },
      { startMode: 'scheduled' as const, startsAt: '2026-10-22T10:30', hasEnd: true, endsAt: '2026-10-21T10:30' },
      { hasEnd: true, endsAt: '2026-10-19T10:30' },
    ])
      expect(compilePromotion(form(change), DEFAULT_CATEGORIES, now).payload).toBeNull();
  });
  it('exports explicit start-inclusive/end-exclusive UTC instants', () => {
    const { payload } = compilePromotion(
      form({ startMode: 'scheduled', startsAt: '2026-10-21T10:30', hasEnd: true, endsAt: '2026-10-22T10:30' }),
      DEFAULT_CATEGORIES,
      now
    );
    expect(payload?.schedule).toEqual({
      startsAt: '2026-10-21T05:00:00.000Z',
      endsAt: '2026-10-22T05:00:00.000Z',
      timezone: 'Asia/Kolkata',
      endExclusive: true,
    });
  });
});
