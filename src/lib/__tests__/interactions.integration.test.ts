import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { ingredientInteractions, ingredients } from '@/db/schema';

/**
 * The interaction engine.
 *
 * Integration rather than unit, because the behaviour under test is mostly
 * queries — which pairs come back, in what order, and what happens when only
 * one half of a pair is present. A mocked database would be asserting the
 * engine's opinion of itself.
 *
 * The most important test here is the one that expects *nothing*: benzoyl
 * peroxide with adapalene. Every version of this feature that reasons about
 * "retinoids" as a class gets that wrong, and getting it wrong means warning
 * people off a combination that is sold pre-mixed on purpose.
 */

const client = new PGlite();
const db = drizzlePglite(client, { schema: { ingredients, ingredientInteractions } });

vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));

const { evaluateRoutine, resolveIngredients, hasPhotosensitiser } = await import(
  '../interactions'
);

const item = (label: string, ingredientIds: string[], prescribed = false) => ({
  label,
  ingredientIds,
  prescribed,
});

beforeAll(async () => {
  // The real migrations, not hand-written DDL that drifts from production.
  await migrate(drizzlePglite(client), { migrationsFolder: 'drizzle' });

  await db.insert(ingredients).values([
    {
      id: 'tretinoin', inciName: 'Tretinoin', commonName: 'Tretinoin',
      synonyms: ['all-trans retinoic acid'],
      prescriptionOnly: true, pregnancyCaution: true, photosensitising: true,
    },
    {
      id: 'adapalene', inciName: 'Adapalene', commonName: 'Adapalene',
      synonyms: [], prescriptionOnly: false, pregnancyCaution: true, photosensitising: false,
    },
    {
      id: 'benzoyl-peroxide', inciName: 'Benzoyl Peroxide', commonName: 'Benzoyl peroxide',
      synonyms: ['bpo'], prescriptionOnly: false, pregnancyCaution: false, photosensitising: false,
    },
    {
      id: 'glycolic-acid', inciName: 'Glycolic Acid', commonName: 'Glycolic acid',
      synonyms: ['aha'], prescriptionOnly: false, pregnancyCaution: false, photosensitising: true,
    },
    {
      id: 'niacinamide', inciName: 'Niacinamide', commonName: 'Niacinamide',
      synonyms: ['vitamin b3'], prescriptionOnly: false, pregnancyCaution: false,
      photosensitising: false,
    },
  ]);

  await db.insert(ingredientInteractions).values([
    {
      id: 'i1', ingredientA: 'benzoyl-peroxide', ingredientB: 'tretinoin', tier: 2,
      summary: 'Benzoyl peroxide oxidises tretinoin.',
      advice: 'Use them at different times of day.',
      citation: 'Martin B et al. Br J Dermatol. 1998;139 Suppl 52:8-11.',
    },
    {
      id: 'i2', ingredientA: 'glycolic-acid', ingredientB: 'tretinoin', tier: 3,
      summary: 'Additive irritation.',
      advice: 'Alternate nights.',
      citation: null,
    },
  ]);
});

afterAll(async () => {
  await client?.close();
});

describe('interaction engine', () => {
  it('reports an established deactivation with its citation', async () => {
    const found = await evaluateRoutine([
      item('Acne gel', ['benzoyl-peroxide']),
      item('Night cream', ['tretinoin'], true),
    ]);

    const tier2 = found.find((f) => f.tier === 2 && f.title.includes('Benzoyl'));
    expect(tier2).toBeDefined();
    expect(tier2?.citation).toMatch(/Br J Dermatol/);
  });

  it('does not flag benzoyl peroxide with adapalene', async () => {
    /*
     * The rule that separates a molecule-level engine from a class-level one.
     * Adapalene is photostable and is sold co-formulated with benzoyl
     * peroxide; a "retinoid" rule would warn against a prescribed product.
     */
    const found = await evaluateRoutine([
      item('Adapalene gel', ['adapalene']),
      item('BP wash', ['benzoyl-peroxide']),
    ]);

    expect(found.filter((f) => f.tier >= 2 && f.title.includes('Benzoyl'))).toHaveLength(0);
  });

  it('shows prescription guidance alongside the interaction, not instead of it', async () => {
    /*
     * An earlier design made the prescription notice a hard stop that
     * suppressed everything below it — which would have withheld the benzoyl
     * peroxide warning from precisely the people on tretinoin.
     */
    const found = await evaluateRoutine([
      item('Tretinoin 0.025%', ['tretinoin'], true),
      item('BP wash', ['benzoyl-peroxide']),
    ]);

    expect(found.some((f) => f.tier === 1)).toBe(true);
    expect(found.some((f) => f.tier === 2 && f.title.includes('Benzoyl'))).toBe(true);
    expect(found[0].tier).toBe(1);
  });

  it('detects a prescription from the ingredient even if unmarked', async () => {
    // Customers do not reliably tick the box. Tretinoin is prescription-only
    // in its own right, and the notice must not depend on them remembering.
    const found = await evaluateRoutine([item('Some cream', ['tretinoin'], false)]);
    expect(found.some((f) => f.tier === 1)).toBe(true);
  });

  it('raises pregnancy caution on the molecule alone', async () => {
    const found = await evaluateRoutine([item('Adapalene gel', ['adapalene'])]);
    const pregnancy = found.find((f) => f.title.includes('pregnancy'));

    expect(pregnancy).toBeDefined();
    expect(pregnancy?.detail).toMatch(/Adapalene/);
  });

  it('orders findings by tier, most consequential first', async () => {
    const found = await evaluateRoutine([
      item('Tretinoin', ['tretinoin'], true),
      item('BP wash', ['benzoyl-peroxide']),
      item('AHA toner', ['glycolic-acid']),
    ]);

    const tiers = found.map((f) => f.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it('says nothing when only one half of a pair is present', async () => {
    const found = await evaluateRoutine([item('BP wash', ['benzoyl-peroxide'])]);
    expect(found).toEqual([]);
  });

  it('catches a conflict with something about to be added to the basket', async () => {
    // The case that makes this useful at the moment of purchase rather than
    // as an audit afterwards.
    const found = await evaluateRoutine(
      [item('Tretinoin', ['tretinoin'], true)],
      ['benzoyl-peroxide']
    );

    expect(found.some((f) => f.tier === 2 && f.title.includes('Benzoyl'))).toBe(true);
  });

  it('returns nothing for an empty routine', async () => {
    expect(await evaluateRoutine([])).toEqual([]);
  });

  it('resolves ingredients from a label, including synonyms', () => {
    const r = resolveIngredients('Aqua, Glycolic Acid, Vitamin B3, Glycerin, Phenoxyethanol');
    expect(r.ids).toEqual(expect.arrayContaining(['glycolic-acid', 'niacinamide']));
  });

  it('reports ingredients it does not recognise instead of matching or dropping them', () => {
    // Inventing a match would produce a confident warning about the wrong
    // molecule; dropping it would read as "nothing to check".
    const r = resolveIngredients('Aqua, Glycerin, Parfum');
    expect(r.ids).toEqual([]);
    expect(r.unresolved.map((u) => u.label)).toEqual(['Aqua', 'Glycerin', 'Parfum']);
    expect(r.complete).toBe(false);
  });

  it('says which ingredients it could not check, even when nothing else is found', async () => {
    const findings = await evaluateRoutine([
      { label: 'Night serum', ingredientIds: [], prescribed: false, unresolvedLabels: ['PDRN (Salmon DNA)'] },
    ]);
    expect(findings).toEqual([
      expect.objectContaining({ title: 'Some ingredients could not be checked', detail: expect.stringContaining('PDRN (Salmon DNA)') }),
    ]);
  });

  it('knows which ingredients raise sun sensitivity', async () => {
    expect(await hasPhotosensitiser(['glycolic-acid'])).toBe(true);
    expect(await hasPhotosensitiser(['niacinamide'])).toBe(false);
    expect(await hasPhotosensitiser([])).toBe(false);
  });
});
