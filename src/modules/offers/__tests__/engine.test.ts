import { describe, expect, it } from 'vitest';
import { bestOffer, offerProblems, type Offer, type QuoteLine } from '../engine';
import { minProfitablePrice, DEFAULT_PROFIT_SETTINGS as S } from '../profit';

const base: Offer = {
  id: 'o1',
  name: 'Test',
  kind: 'percent_off',
  percentOff: 10,
  amountPaise: null,
  buyQty: null,
  getQty: null,
  productIds: null,
  minSubtotalPaise: 0,
  minQuantity: 1,
  couponCode: null,
  firstOrderOnly: false,
  maxUses: null,
  startsAt: null,
  endsAt: null,
  active: true,
};
// ₹600 serum costing ₹200: floor is ₹289, so it has ₹311 of room per unit.
const serum: QuoteLine = { productId: 'serum', size: '30ml', unitPrice: 60000, quantity: 1, costPaise: 20000 };
const quote = (offers: Offer[], lines: QuoteLine[] = [serum], extra = {}) =>
  bestOffer({ lines, offers, isFirstOrder: true, usage: {}, settings: S, ...extra });

describe('profit floor', () => {
  it('is cost plus 20%, grossed up for 18% GST and a 2% fee', () => {
    // 200 × 1.2 × 1.18 / 0.98 = 288.98 → ₹289 (rounded up in paise).
    expect(minProfitablePrice(20000, S)).toBe(28898);
  });
});

describe('bestOffer', () => {
  it('applies a percentage off', () => {
    expect(quote([base]).applied).toMatchObject({ itemDiscount: 6000, capped: false });
  });

  it('caps any offer at the profit floor', () => {
    const r = quote([{ ...base, percentOff: 90 }]).applied!;
    expect(r.itemDiscount).toBe(60000 - 28898);
    expect(r.capped).toBe(true);
  });

  it('gives nothing on a product with no cost price', () => {
    expect(quote([base], [{ ...serum, costPaise: null }]).applied).toBeNull();
  });

  it('buy 2 get 1 frees the cheapest unit', () => {
    const toner: QuoteLine = { productId: 'toner', size: '100ml', unitPrice: 30000, quantity: 1, costPaise: 5000 };
    const r = quote([{ ...base, kind: 'buy_x_get_y', buyQty: 2, getQty: 1 }], [{ ...serum, quantity: 2 }, toner]);
    expect(r.applied?.itemDiscount).toBe(30000);
  });

  it('honours minimum spend, product scope, dates, use limits and first-order rules', () => {
    expect(quote([{ ...base, minSubtotalPaise: 100000 }]).applied).toBeNull();
    expect(quote([{ ...base, productIds: ['other'] }]).applied).toBeNull();
    expect(quote([{ ...base, endsAt: new Date(Date.now() - 1000) }]).applied).toBeNull();
    expect(quote([{ ...base, maxUses: 5 }], [serum], { usage: { o1: 5 } }).applied).toBeNull();
    expect(quote([{ ...base, firstOrderOnly: true }], [serum], { isFirstOrder: false }).applied).toBeNull();
  });

  it('needs the code for a coupon offer, and picks the better of coupon and automatic', () => {
    const coupon = { ...base, id: 'c', couponCode: 'GLOW20', percentOff: 20 };
    expect(quote([base, coupon]).applied?.offerId).toBe('o1');
    expect(quote([base, coupon], [serum], { code: ' glow20 ' }).applied?.offerId).toBe('c');
    expect(quote([base], [serum], { code: 'NOPE' }).codeProblem).toBe('That code is not valid right now.');
  });

  it('waives delivery only when the margin pays for it', () => {
    const free = { ...base, kind: 'free_delivery' as const };
    expect(quote([free]).applied).toMatchObject({ freeDelivery: true, itemDiscount: 0 });
    const thin = { ...serum, unitPrice: 29000 }; // ₹1 of room cannot pay ₹79 delivery
    expect(quote([free], [thin]).applied).toBeNull();
  });
});

describe('offerProblems (checked when saving)', () => {
  const sku = { productId: 'serum', productName: 'Serum', size: '30ml', price: 60000, costPaise: 20000 };

  it('accepts a profitable offer', () => {
    expect(offerProblems({ ...base, percentOff: 50 }, [sku], S)).toEqual([]);
  });

  it('refuses one that goes below the floor, saying how far it can go', () => {
    const [problem] = offerProblems({ ...base, percentOff: 60 }, [sku], S);
    expect(problem).toContain('below its floor');
    expect(problem).toContain('51%');
  });

  it('refuses when a covered product has no cost price', () => {
    expect(offerProblems(base, [{ ...sku, costPaise: null }], S)[0]).toContain('Add a cost price');
  });

  it('spreads a flat amount over the smallest qualifying bag', () => {
    expect(offerProblems({ ...base, kind: 'amount_off', amountPaise: 40000 }, [sku], S)).toHaveLength(1);
    expect(
      offerProblems({ ...base, kind: 'amount_off', amountPaise: 40000, minSubtotalPaise: 180000 }, [sku], S)
    ).toEqual([]);
  });
});

describe('allocateDiscount', () => {
  it('splits by weight, paise for paise, never above a line', async () => {
    const { allocateDiscount } = await import('../engine');
    expect(allocateDiscount(100, [1, 1, 1], [1000, 1000, 1000])).toEqual([34, 33, 33]);
    expect(allocateDiscount(101, [3, 0, 1], [1000, 1000, 1000])).toEqual([76, 0, 25]);
    expect(allocateDiscount(50, [1, 1], [10, 1000])).toEqual([10, 40]);
    expect(allocateDiscount(0, [1, 2], [10, 10])).toEqual([0, 0]);
  });
});
