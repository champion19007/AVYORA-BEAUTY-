import { describe, it, expect } from 'vitest';
import {
  toPaise,
  toRupees,
  formatPaise,
  calculateTotals,
  generateOrderNumber,
  FREE_SHIPPING_THRESHOLD_PAISE,
  STANDARD_SHIPPING_PAISE,
  GST_RATE,
} from '../money';

describe('paise conversion', () => {
  it('round-trips whole rupees', () => {
    for (const r of [0, 1, 349, 1199, 99999]) {
      expect(toRupees(toPaise(r))).toBe(r);
    }
  });

  it('keeps fractional rupees as integers', () => {
    expect(toPaise(349.5)).toBe(34950);
    expect(toPaise(0.1)).toBe(10);
    expect(Number.isInteger(toPaise(19.99))).toBe(true);
  });

  it('avoids the float drift that motivated integer money', () => {
    // 0.1 + 0.2 !== 0.3 in float. In paise it is exact.
    const drifty = 0.1 + 0.2;
    expect(drifty).not.toBe(0.3);
    expect(toPaise(0.1) + toPaise(0.2)).toBe(toPaise(0.3));
  });
});

describe('calculateTotals', () => {
  const line = (unitPrice: number, quantity = 1) => ({ unitPrice, quantity });

  it('sums line totals into the subtotal', () => {
    const t = calculateTotals([line(349, 2), line(649)]);
    expect(t.subtotal).toBe(toPaise(349 * 2 + 649));
  });

  it('charges shipping below the free threshold', () => {
    const t = calculateTotals([line(349)]);
    expect(t.shipping).toBe(STANDARD_SHIPPING_PAISE);
    expect(t.total).toBe(toPaise(349) + STANDARD_SHIPPING_PAISE);
  });

  it('gives free shipping at exactly the threshold', () => {
    const t = calculateTotals([line(1199)]);
    expect(t.subtotal).toBe(FREE_SHIPPING_THRESHOLD_PAISE);
    expect(t.shipping).toBe(0);
  });

  it('gives free shipping above the threshold', () => {
    expect(calculateTotals([line(1500)]).shipping).toBe(0);
  });

  it('applies the discount before deciding on shipping', () => {
    // Above the threshold before discount, below it after.
    const t = calculateTotals([line(1250)], toPaise(200));
    expect(t.shipping).toBe(STANDARD_SHIPPING_PAISE);
    expect(t.total).toBe(toPaise(1250) - toPaise(200) + STANDARD_SHIPPING_PAISE);
  });

  it('never lets a discount push the total below zero', () => {
    const t = calculateTotals([line(100)], toPaise(500));
    expect(t.total).toBeGreaterThanOrEqual(0);
    expect(t.discount).toBeLessThanOrEqual(t.subtotal);
  });

  it('charges no shipping on an empty basket', () => {
    const t = calculateTotals([]);
    expect(t).toMatchObject({ subtotal: 0, shipping: 0, total: 0 });
  });

  it('reports GST as a component of the total, not an addition', () => {
    const t = calculateTotals([line(1199)]);
    // total = net + net*rate, so tax = total - total/(1+rate)
    expect(t.tax).toBe(Math.round(t.total - t.total / (1 + GST_RATE)));
    expect(t.tax).toBeLessThan(t.total);
  });

  it('returns whole paise for every component', () => {
    const t = calculateTotals([line(349, 3), line(799)], 12345);
    for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true);
  });

  it('scales linearly with quantity', () => {
    const one = calculateTotals([line(500)]);
    const three = calculateTotals([line(500, 3)]);
    expect(three.subtotal).toBe(one.subtotal * 3);
  });
});

describe('formatPaise', () => {
  it('drops decimals on whole rupees and keeps them otherwise', () => {
    expect(formatPaise(toPaise(349))).not.toContain('.');
    expect(formatPaise(34950)).toContain('.5');
  });
});

describe('generateOrderNumber', () => {
  it('is prefixed and fixed length', () => {
    expect(generateOrderNumber()).toMatch(/^AVY-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/);
  });

  it('omits characters that are misread aloud', () => {
    const sample = Array.from({ length: 300 }, generateOrderNumber).join('');
    for (const ch of ['0', 'O', '1', 'I']) expect(sample.includes(ch)).toBe(false);
  });

  it('does not collide across a realistic batch', () => {
    const n = 2000;
    expect(new Set(Array.from({ length: n }, generateOrderNumber)).size).toBe(n);
  });
});
