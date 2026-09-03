import { afterEach, describe, expect, it } from 'vitest';
import { invoiceNumberFor, splitTax } from '@/lib/invoice';

/**
 * The GST split.
 *
 * The customer pays the same either way; what changes is which heads the tax
 * is filed under. Getting it wrong is invisible until a return is scrutinised,
 * which is exactly the kind of error worth pinning in a test.
 */

const ORIGINAL = process.env.SELLER_STATE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SELLER_STATE;
  else process.env.SELLER_STATE = ORIGINAL;
});

describe('splitTax', () => {
  it('splits into CGST and SGST within the seller state', () => {
    process.env.SELLER_STATE = 'Maharashtra';
    const split = splitTax(26982, 'Maharashtra');

    expect(split.intraState).toBe(true);
    expect(split.igst).toBe(0);
    expect(split.cgst + split.sgst).toBe(26982);
  });

  it('uses IGST for another state', () => {
    process.env.SELLER_STATE = 'Maharashtra';
    const split = splitTax(26982, 'Rajasthan');

    expect(split.intraState).toBe(false);
    expect(split.igst).toBe(26982);
    expect(split.cgst).toBe(0);
    expect(split.sgst).toBe(0);
  });

  it('never loses a paisa on an odd amount', () => {
    process.env.SELLER_STATE = 'Maharashtra';
    const split = splitTax(101, 'Maharashtra');

    // Halving twice would produce 50 + 50 and quietly drop one paisa.
    expect(split.cgst).toBe(50);
    expect(split.sgst).toBe(51);
    expect(split.cgst + split.sgst).toBe(101);
  });

  it('matches state names regardless of case or padding', () => {
    process.env.SELLER_STATE = 'Maharashtra';
    expect(splitTax(100, '  maharashtra ').intraState).toBe(true);
  });

  it('treats a missing buyer state as inter-state', () => {
    process.env.SELLER_STATE = 'Maharashtra';
    // Safer default: IGST is a single line, and an unknown destination should
    // not be quietly filed as a local sale.
    for (const value of [null, undefined, '']) {
      expect(splitTax(100, value).intraState).toBe(false);
      expect(splitTax(100, value).igst).toBe(100);
    }
  });
});

describe('invoiceNumberFor', () => {
  it('derives a stable number from the order number', () => {
    expect(invoiceNumberFor('AVY-7K2M4Q')).toBe('INV-7K2M4Q');
    // Deterministic: generating an invoice twice cannot produce two numbers.
    expect(invoiceNumberFor('AVY-7K2M4Q')).toBe(invoiceNumberFor('AVY-7K2M4Q'));
  });
});
