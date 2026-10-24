import { describe, expect, it } from 'vitest';
import { bagProgress, promotionBadge, promotionCovers, promotionDetail, type Promotion } from '../promotions';

const b2g1: Promotion = {
  id: 'p1',
  name: 'Buy 2, get 1 free',
  kind: 'buy_x_get_y',
  percentOff: null,
  amountPaise: null,
  buyQty: 2,
  getQty: 1,
  productIds: ['serum', 'toner'],
  minSubtotalPaise: 0,
  minQuantity: 1,
  firstOrderOnly: false,
  endsAt: null,
};
const line = (productId: string, quantity: number) => ({ productId, quantity, unitPrice: 50000 });

describe('what customers are told', () => {
  it('labels and explains a buy-2-get-1 offer', () => {
    expect(promotionBadge(b2g1)).toBe('Buy 2, get 1 free');
    expect(promotionBadge({ ...b2g1, buyQty: 1, getQty: 1 })).toBe('Buy 1, get 1 free');
    expect(promotionDetail(b2g1)).toBe(
      'Add any 3 eligible products to your bag and the lowest-priced one is free. Mix and match.'
    );
  });

  it('knows which products it covers', () => {
    expect(promotionCovers(b2g1, 'serum')).toBe(true);
    expect(promotionCovers(b2g1, 'cleanser')).toBe(false);
    expect(promotionCovers({ ...b2g1, productIds: null }, 'cleanser')).toBe(true);
  });

  it('tells the bag how close it is, counting only eligible items, mixed and matched', () => {
    expect(bagProgress(b2g1, [line('cleanser', 5)])).toBeNull();
    expect(bagProgress(b2g1, [line('serum', 1)])?.message).toBe(
      'Buy 2, get 1 free: add 2 more eligible items and the lowest-priced is free.'
    );
    expect(bagProgress(b2g1, [line('serum', 1), line('toner', 1)])).toEqual({
      qualifies: false,
      message: 'Buy 2, get 1 free: add 1 more eligible item and the lowest-priced is free.',
    });
    expect(bagProgress(b2g1, [line('serum', 2), line('toner', 1)])).toEqual({
      qualifies: true,
      message: 'Buy 2, get 1 free: 1 item is free at checkout.',
    });
    expect(bagProgress(b2g1, [line('serum', 4)])?.message).toBe(
      'Buy 2, get 1 free: 1 item is free at checkout. Add 2 more for another free item.'
    );
  });

  it('nudges towards a minimum spend for other offers', () => {
    const tenOff: Promotion = { ...b2g1, kind: 'percent_off', percentOff: 10, minSubtotalPaise: 150000 };
    expect(bagProgress(tenOff, [line('serum', 1)])?.message).toBe('10% off: spend ₹1,000 more on eligible items.');
    expect(bagProgress(tenOff, [line('serum', 3)])).toEqual({
      qualifies: true,
      message: '10% off: applied at checkout.',
    });
  });
});
