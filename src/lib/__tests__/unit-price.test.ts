import { describe, expect, it } from 'vitest';
import { parseSize, unitPricePaise } from '../unit-price';

describe('unit prices for comparison', () => {
  it('reads the catalogue size labels', () => {
    expect(parseSize('150ml')).toEqual({ quantity: 150, unit: 'ml' });
    expect(parseSize('20g')).toEqual({ quantity: 20, unit: 'g' });
    expect(parseSize('60 Pads')).toEqual({ quantity: 60, unit: 'item' });
    expect(parseSize('1 Mask')).toEqual({ quantity: 1, unit: 'item' });
    expect(parseSize('travel size')).toBeNull();
  });

  it('gives integer paise per 10 ml, 10 g or item', () => {
    expect(unitPricePaise(64_900, '150ml')).toEqual({ paise: 4327, per: '10 ml' });
    expect(unitPricePaise(50_000, '20g')).toEqual({ paise: 25_000, per: '10 g' });
    expect(unitPricePaise(90_000, '60 Pads')).toEqual({ paise: 1500, per: 'item' });
    expect(unitPricePaise(10_000, 'unknown')).toBeNull();
    expect(unitPricePaise(0, '30ml')).toBeNull();
  });
});
