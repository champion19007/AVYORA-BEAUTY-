import { describe, expect, it } from 'vitest';
import { resolvePrice, type PricingRow } from '@/lib/pricing';

/**
 * Price resolution.
 *
 * The rules that matter are the ones about *not* applying an offer: a sale
 * price that is not actually lower, and an offer outside its window. Both
 * would otherwise show a customer a struck-out price beside an identical or
 * higher one, which is at best a typo and at worst a dark pattern.
 */

const BASE: PricingRow = {
  id: 'x',
  productId: 'p',
  size: '30ml',
  price: 149900,
  salePrice: null,
  offerLabel: null,
  offerStartsAt: null,
  offerEndsAt: null,
  updatedBy: 'owner',
  updatedAt: new Date(),
};

const NOW = new Date('2026-06-15T12:00:00Z');

describe('resolvePrice', () => {
  it('falls back to the catalogue when there is no override', () => {
    expect(resolvePrice(64900, undefined, NOW)).toEqual({
      price: 64900,
      wasPrice: null,
      offerLabel: null,
      overridden: false,
    });
  });

  it('uses the owner price over the catalogue', () => {
    const result = resolvePrice(64900, BASE, NOW);
    expect(result.price).toBe(149900);
    expect(result.overridden).toBe(true);
  });

  it('applies a live offer and keeps the original to strike through', () => {
    const row = { ...BASE, salePrice: 99900, offerLabel: 'Festive' };
    const result = resolvePrice(0, row, NOW);

    expect(result.price).toBe(99900);
    expect(result.wasPrice).toBe(149900);
    expect(result.offerLabel).toBe('Festive');
  });

  it('ignores an offer that is not actually cheaper', () => {
    for (const salePrice of [149900, 159900]) {
      const result = resolvePrice(0, { ...BASE, salePrice }, NOW);
      expect(result.price).toBe(149900);
      expect(result.wasPrice).toBeNull();
    }
  });

  it('ignores an offer that has not started', () => {
    const row = { ...BASE, salePrice: 99900, offerStartsAt: new Date('2026-07-01T00:00:00Z') };
    expect(resolvePrice(0, row, NOW).price).toBe(149900);
  });

  it('ignores an offer that has ended', () => {
    const row = { ...BASE, salePrice: 99900, offerEndsAt: new Date('2026-06-01T00:00:00Z') };
    expect(resolvePrice(0, row, NOW).price).toBe(149900);
  });

  it('treats the end of the window as exclusive', () => {
    // An offer ending "now" is over; it must not linger for one more request.
    const row = { ...BASE, salePrice: 99900, offerEndsAt: NOW };
    expect(resolvePrice(0, row, NOW).price).toBe(149900);
  });
});
