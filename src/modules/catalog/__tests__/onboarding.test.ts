/**
 * Onboarding validation, with SYNTHETIC records only (not real products,
 * formulations, prices or approvals).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewOnboarding } from '../onboarding';

const EVIDENCE = [
  {
    id: 'synthetic-dossier',
    title: 'Synthetic',
    url: null,
    sourceType: 'formulation_dossier' as const,
    retrievedAt: '2026-10-10',
    limitations: 'Synthetic',
  },
];
const example = () =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), 'docs/onboarding/example-products.synthetic.json'), 'utf8')
  ) as Record<string, unknown>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- synthetic JSON records are patched freely
const one = (patch: (r: Record<string, any>) => void) => {
  const [r] = example();
  patch(r);
  return previewOnboarding([r], EVIDENCE).records[0];
};

describe('product onboarding preview', () => {
  it('the example record is publishable and recommendable, with missing images and directions listed as unresolved', () => {
    const p = previewOnboarding(example(), EVIDENCE);
    expect(p.ok).toBe(true);
    expect(p.records[0]).toMatchObject({ publishable: true, recommendable: true });
    expect(p.records[0].unresolved.join(' ')).toMatch(/images/);
    expect(p.records[0].unresolved.join(' ')).toMatch(/directions/);
  });

  it('a draft is never publishable', () => {
    expect(one((r) => (r.review = { status: 'draft' }))).toMatchObject({ publishable: false, recommendable: false });
  });

  it('prices must be integer paise', () => {
    expect(one((r) => (r.variants[0].pricePaise = 499.5)).problems.join(' ')).toMatch(/pricePaise/);
  });

  it('a mismatched INCI blocks publication (shared formulation checks)', () => {
    expect(one((r) => (r.formulation.fullInci = 'Niacinamide, Glycerin')).problems.join(' ')).toMatch(
      /full INCI says "Niacinamide"/
    );
  });

  it('an unresolved ingredient keeps a publishable product out of recommendations', () => {
    const r = one((rec) => {
      rec.formulation.fullInci = 'Aqua, Mystery Extract';
      rec.formulation.ingredients[1] = {
        position: 2,
        inciLabel: 'Mystery Extract',
        ingredientId: null,
        concentration: { known: false },
      };
    });
    expect(r).toMatchObject({ publishable: true, recommendable: false });
    expect(r.unresolved.join(' ')).toMatch(/Mystery Extract/);
  });

  it('a treatment without approved directions is not recommendable', () => {
    expect(one((r) => (r.role = 'treatment'))).toMatchObject({ publishable: true, recommendable: false });
  });

  it('claims need existing evidence and pass the content rules', () => {
    const r = one(
      (rec) => (rec.claims = [{ text: 'Zero irritation for everyone', evidenceIds: ['missing'], limitations: 'none' }])
    );
    expect(r.publishable).toBe(false);
    expect(r.problems.join(' ')).toMatch(/evidence missing does not exist/);
    expect(r.problems.join(' ')).toMatch(/absolute claim/);
  });

  it('duplicate SKUs in a batch fail the batch', () => {
    const p = previewOnboarding(
      [...example(), { ...example()[0], id: 'synthetic-two', slug: 'synthetic-two' }],
      EVIDENCE
    );
    expect(p.ok).toBe(false);
    expect(p.problems.join(' ')).toMatch(/Duplicate SKU/);
  });

  it('rejects anything that is not an array of records', () => {
    expect(previewOnboarding({ not: 'an array' }, EVIDENCE).ok).toBe(false);
  });
});
