import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/data/mock-data';
import { PRODUCT_CATEGORIES } from '../product-store';

describe('shop categories', () => {
  it('include every category the product editor offers, so no product falls outside the filters', () => {
    const shop = new Set(CATEGORIES.map((c) => c.id));
    expect(PRODUCT_CATEGORIES.map(([id]) => id).filter((id) => !shop.has(id))).toEqual([]);
  });
});
