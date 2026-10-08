import { describe, expect, it } from 'vitest';
import { findContentProblems, stripComments } from '@/lib/content-claims';
import { launchBlockers, storefrontProblems, storefrontSources } from '@/lib/launch-readiness';
import {
  DELIVERY_TERMS,
  FREE_DELIVERY_LINE,
  FREE_SHIPPING_THRESHOLD_PAISE,
  STANDARD_SHIPPING_PAISE,
  calculateTotals,
  formatPaise,
} from '@/lib/money';
import { PRODUCTS } from '@/data/mock-data';

const ROOT = process.cwd();

describe('content rules', () => {
  it.each([
    ['Buy 2, Get 3rd Free on best sellers', 'unsupported_offer'],
    ['5% cashback on every order as Avyora Credit', 'unsupported_offer'],
    ['Get a Free Surprise Gift on orders above ₹1199', 'unsupported_offer'],
    ['An additional 15% off every bundle', 'unsupported_offer'],
    ['Complimentary delivery, always', 'unsupported_offer'],
    ['Fast-acting Vitamin A with zero irritation.', 'absolute_claim'],
    ['Gently dissolve dead skin without stinging or redness.', 'absolute_claim'],
    ['Clinically proven results', 'absolute_claim'],
    ['Science-backed clinical skincare formulations', 'absolute_claim'],
    ['GSTIN: [TO CONFIRM]', 'placeholder'],
    ['WhatsApp +91 99999 99999', 'placeholder'],
  ])('flags %j', (text, kind) => {
    expect(findContentProblems(text).map((p) => p.kind)).toContain(kind);
  });

  it.each([
    'These are estimates, not guarantees.',
    'A low-pH, water-based gel cleanser.',
    FREE_DELIVERY_LINE,
    DELIVERY_TERMS,
    'Secure checkout',
  ])('passes %j', (text) => {
    expect(findContentProblems(text)).toEqual([]);
  });

  it('ignores comments but keeps URLs', () => {
    const src = "/* was: 5% cashback */\n// zero irritation\nconst u = 'https://x.test'; // trailing";
    expect(findContentProblems(stripComments(src))).toEqual([]);
    expect(stripComments(src)).toContain('https://x.test');
  });
});

describe('storefront consistency', () => {
  it('scans the customer-facing source, not staff tools', () => {
    const files = storefrontSources(ROOT).map((s) => s.file);
    expect(files).toContain('src/components/layout/announcement-bar.tsx');
    expect(files).toContain('src/app/(legal)/shipping-policy/page.tsx');
    expect(files.some((f) => f.startsWith('src/app/admin/'))).toBe(false);
  });

  it('advertises no offer the order calculation does not apply, and no absolute claim', () => {
    const problems = storefrontProblems(ROOT).filter((p) => p.kind !== 'placeholder');
    expect(problems).toEqual([]);
  });

  it('product copy is free of placeholders, unsupported offers and absolute claims', () => {
    for (const p of PRODUCTS) {
      expect(findContentProblems(`${p.name} ${p.tagline} ${p.description}`), p.id).toEqual([]);
    }
  });

  it('no dummy phone number anywhere customers can see', () => {
    const dummy = storefrontProblems(ROOT).filter((p) => p.why === 'dummy phone number');
    expect(dummy).toEqual([]);
  });

  it('never hardcodes the delivery charge or threshold outside the money module', () => {
    const literal = /₹\s?1,?199|&#8377;\s?1,?199|₹\s?79\b|&#8377;\s?79\b|\b1199\b/;
    // The catalogue is exempt: a product may itself cost ₹1,199.
    const offenders = storefrontSources(ROOT)
      .filter(({ file, text }) => !file.startsWith('src/data/') && literal.test(text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe('delivery copy matches what checkout charges', () => {
  const line = (rupees: number) => [{ unitPrice: rupees, quantity: 1 }];
  const threshold = FREE_SHIPPING_THRESHOLD_PAISE / 100;

  it('charges the stated fee just below the threshold and nothing at it', () => {
    expect(calculateTotals(line(threshold - 1)).shipping).toBe(STANDARD_SHIPPING_PAISE);
    expect(calculateTotals(line(threshold)).shipping).toBe(0);
  });

  it('states those same figures', () => {
    expect(DELIVERY_TERMS).toContain(formatPaise(STANDARD_SHIPPING_PAISE));
    expect(DELIVERY_TERMS).toContain(formatPaise(FREE_SHIPPING_THRESHOLD_PAISE));
    expect(FREE_DELIVERY_LINE).toContain(formatPaise(FREE_SHIPPING_THRESHOLD_PAISE));
  });
});

describe('launch check', () => {
  it('reports unfinished business content and treatments without directions', () => {
    const blockers = launchBlockers(ROOT);
    expect(blockers.some((b) => b.startsWith('src/app/(legal)/contact/page.tsx'))).toBe(true);
    expect(blockers.some((b) => b.startsWith('Confirm: Support mailbox'))).toBe(true);
    expect(blockers.some((b) => b.startsWith('Treatments not ready to recommend'))).toBe(true);
  });
});
