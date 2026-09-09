import { describe, expect, it } from 'vitest';
import {
  REJECT_AT,
  combineSignals,
  normalisePhone,
  scoreAddress,
  scoreBasket,
  type RiskSignal,
} from '@/lib/cod-risk';

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

describe('combining signals into a decision', () => {
  const sig = (code: RiskSignal['code'], weight: number): RiskSignal => ({
    code,
    reason: code,
    weight,
  });

  it('approves an order with nothing against it', () => {
    expect(combineSignals([])).toMatchObject({ score: 0, status: 'approved' });
  });

  it('lets a lone weak signal through', () => {
    // An address with no house number, and nothing else wrong. Plenty of
    // genuine addresses read like this; holding them all would punish real
    // customers for how their street is written.
    expect(combineSignals([sig('address_incomplete', 35)]).status).toBe('approved');
  });

  it('holds on a single strong signal but never refuses on one', () => {
    // The asymmetry that matters. A wrong hold costs one message; a wrong
    // rejection costs a customer permanently, so one signal can never do it.
    for (const weight of [50, 70, 100]) {
      const result = combineSignals([sig('address_junk', weight)]);
      expect(result.status, `weight ${weight}`).toBe('review');
    }
  });

  it('refuses when two signals agree and the score is high', () => {
    const result = combineSignals([sig('velocity', 70), sig('address_junk', 50)]);
    expect(result.status).toBe('rejected');
  });

  it('does not sum weights into a rejection', () => {
    /*
     * Three mild suspicions total 110 if added up, which would refuse someone
     * whose only crime is a short address and a generous first order. The
     * strongest signal plus a discounted remainder keeps that a hold.
     */
    const result = combineSignals([
      sig('address_incomplete', 35),
      sig('high_value_first_order', 25),
      sig('velocity', 30),
    ]);

    expect(result.score).toBeLessThan(REJECT_AT);
    expect(result.status).toBe('review');
  });

  it('never scores above 100', () => {
    const result = combineSignals([
      sig('prior_returns', 80),
      sig('velocity', 70),
      sig('address_junk', 50),
      sig('address_incomplete', 35),
    ]);

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.status).toBe('rejected');
  });

  it('returns the signals it judged, so staff can see why', () => {
    const signals = [sig('velocity', 70), sig('address_junk', 50)];
    expect(combineSignals(signals).signals).toEqual(signals);
  });
});
