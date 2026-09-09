import { describe, expect, it } from 'vitest';
import { normalisePhone, scoreAddress, scoreBasket } from '@/lib/cod-risk';

/**
 * The signals that need no database.
 *
 * These matter more than their size suggests: a false positive here does not
 * merely inconvenience someone, it can cancel a real customer's order. So the
 * tests are written from the direction that costs money — a genuine address
 * that happens to be short, a real name that happens to repeat a letter —
 * rather than only proving that obvious junk is caught.
 */

const REAL = {
  fullName: 'Priya Sharma',
  line1: 'Flat 402, Sunrise Residency, Andheri East',
  line2: 'Near Chakala Metro',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '400059',
};

describe('address scoring', () => {
  it('passes a real address cleanly', () => {
    expect(scoreAddress(REAL)).toEqual([]);
  });

  it('flags an address with no number anywhere in it', () => {
    const codes = scoreAddress({ ...REAL, line1: 'Sunrise Residency', line2: null }).map(
      (s) => s.code
    );
    expect(codes).toContain('address_incomplete');
  });

  it('flags keyboard mashing in the name', () => {
    const codes = scoreAddress({ ...REAL, fullName: 'asdf asdf' }).map((s) => s.code);
    expect(codes).toContain('address_junk');
  });

  it('flags a repeated-character name', () => {
    const codes = scoreAddress({ ...REAL, fullName: 'aaaaa' }).map((s) => s.code);
    expect(codes).toContain('address_junk');
  });

  it('does not flag a real name containing a doubled letter', () => {
    // Two of a letter is normal in a name. Only a run of five is not.
    for (const fullName of ['Aabid Khan', 'Neelam Iyer', 'Sreeja Menon']) {
      expect(scoreAddress({ ...REAL, fullName }).map((s) => s.code)).not.toContain(
        'address_junk'
      );
    }
  });

  it('does not flag a short but genuine address that has a number', () => {
    const signals = scoreAddress({
      ...REAL,
      line1: '12 MG Road, Fort',
      line2: null,
      city: 'Mumbai',
    });
    expect(signals).toEqual([]);
  });
});

describe('basket scoring', () => {
  it('says nothing about a returning customer, however large the order', () => {
    expect(scoreBasket(2_000_000, 4)).toEqual([]);
  });

  it('flags a large first order', () => {
    expect(scoreBasket(500_000, 0).map((s) => s.code)).toEqual(['high_value_first_order']);
  });

  it('leaves an ordinary first order alone', () => {
    expect(scoreBasket(120_000, 0)).toEqual([]);
  });
});

describe('phone normalisation', () => {
  it('treats every way of writing one number as the same number', () => {
    // The point of this function: changing the format must not defeat the
    // velocity and history lookups, which is the laziest evasion there is.
    const forms = ['9876543210', '+919876543210', '+91 98765 43210', '09876543210'];
    const normalised = new Set(forms.map(normalisePhone));

    expect(normalised.size).toBe(1);
    expect([...normalised][0]).toBe('9876543210');
  });
});
