import { describe, expect, it } from 'vitest';
import { AMBIGUOUS_ALIASES, INGREDIENTS, type Ingredient } from '../dictionary';
import { buildAliasMap, labelClaim, normaliseLabel, resolveLabel, resolveLabels } from '../resolve';
import {
  coverageOf,
  formulationProblems,
  knowledgeProblems,
  treatmentReadiness,
  type EvidenceSource,
  type Formulation,
} from '../formulations';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { APPROVED_DIRECTIONS, TREATMENTS, type ProductDirections } from '@/data/product-directions';
import { PRODUCTS } from '@/data/mock-data';

const status = (label: string) => resolveLabel(label).status;
const idOf = (label: string) => {
  const r = resolveLabel(label);
  return r.status === 'resolved' ? r.id : r.status;
};

describe('label matching (audit #18)', () => {
  it.each([
    ['Niacinamide 10%', 'niacinamide'],
    ['Hyaluronic Acid (5 Weights)', 'hyaluronic-acid'],
    ['  NIACINAMIDE  ', 'niacinamide'],
    ['Vitamin B3', 'niacinamide'],
    ['Retinaldehyde', 'retinal'],
    ['Retinal', 'retinal'],
    ['Retinol', 'retinol'],
    ['L-Ascorbic Acid', 'ascorbic-acid'],
    ['Sodium Hyaluronate', 'hyaluronic-acid'],
    ['Ceramide NP', 'ceramides'],
  ])('%j resolves to %s', (label, id) => {
    expect(idOf(label)).toBe(id);
  });

  it('keeps retinol and retinaldehyde as different ingredients', () => {
    expect(idOf('Retinol')).not.toBe(idOf('Retinaldehyde'));
    expect(resolveLabels(['Retinaldehyde', 'Retinol']).ids.sort()).toEqual(['retinal', 'retinol']);
  });

  it.each(['Vitamin C', 'vitamin c', 'AHA', 'BHA', 'Vitamin A', 'PHA', 'uv filters', 'Peptides'])(
    '%j is ambiguous and never resolves to one ingredient',
    (label) => {
      expect(status(label)).toBe('ambiguous');
    }
  );

  it('does not let a parenthetical marketing label drive the match', () => {
    // "(PHA)" is stripped; "Gluconolactone" is not in the dictionary yet.
    expect(status('Gluconolactone (PHA)')).toBe('unresolved');
    expect(status('PDRN (Salmon DNA)')).toBe('unresolved');
    expect(normaliseLabel('Hyaluronic Acid (5 Weights)')).toBe('hyaluronic acid');
  });

  it('keeps a printed percentage as an unverified label claim, never as formulation data', () => {
    expect(resolveLabel('Niacinamide 10%')).toMatchObject({ status: 'resolved', labelClaim: { value: 10, unit: 'percent' } });
    expect(labelClaim('Snail Secretion Filtrate 96%')).toEqual({ value: 96, unit: 'percent' });
    expect(status('Snail Secretion Filtrate 96%')).toBe('unresolved');
    expect(labelClaim('Ceramides')).toBeNull();
  });

  it('reports a set as incomplete when anything is ambiguous or unknown', () => {
    const r = resolveLabels('Aqua, Niacinamide 10%, Vitamin C, Zinc PCA');
    expect(r.ids).toEqual(['water', 'niacinamide']);
    expect(r.ambiguous.map((a) => a.label)).toEqual(['Vitamin C']);
    expect(r.unresolved.map((u) => u.label)).toEqual(['Zinc PCA']);
    expect(r.complete).toBe(false);
  });
});

describe('alias map', () => {
  it('has no collisions in the dictionary', () => {
    expect(buildAliasMap().collisions).toEqual([]);
    const ids = INGREDIENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('turns an alias claimed by two ingredients into an ambiguity, not a guess', () => {
    const a: Ingredient = { ...INGREDIENTS[0], id: 'a', inci: 'Alpha', common: 'Alpha', aliases: ['shared name'] };
    const b: Ingredient = { ...INGREDIENTS[0], id: 'b', inci: 'Beta', common: 'Beta', aliases: ['Shared Name'] };
    const map = buildAliasMap([a, b], []);
    expect(map.collisions).toEqual([{ alias: 'shared name', ids: ['a', 'b'] }]);
    expect(resolveLabel('shared name', map)).toMatchObject({ status: 'ambiguous', candidates: ['a', 'b'] });
  });

  it('every declared ambiguous alias is reachable', () => {
    for (const { alias } of AMBIGUOUS_ALIASES) expect(status(alias)).toBe('ambiguous');
  });
});

describe('catalogue highlights', () => {
  it('never claim complete coverage: every product is unknown until a formulation is verified', () => {
    for (const p of PRODUCTS) expect(coverageOf(p.id, FORMULATIONS)).toBe('unknown');
  });

  it('resolve where they can, and say where they cannot', () => {
    const vitC = resolveLabels(PRODUCTS.find((p) => p.id === 'vitamin-c-serum')!.ingredients);
    expect(vitC.complete).toBe(false);
    expect(vitC.ambiguous).toHaveLength(1);
    const niacinamide = resolveLabels(PRODUCTS.find((p) => p.id === 'niacinamide-drops')!.ingredients);
    expect(niacinamide.ids).toEqual(['niacinamide']);
    expect(niacinamide.unresolved.map((u) => u.label)).toEqual(['Zinc PCA']);
  });
});

/* ------------------------------------------------------------------------ */

const EVIDENCE: EvidenceSource[] = [
  { id: 'e1', title: 'Fixture dossier', url: null, sourceType: 'formulation_dossier', retrievedAt: '2026-01-01', limitations: 'Test only' },
];

const good = (over: Partial<Formulation> = {}): Formulation => ({
  productId: 'niacinamide-drops',
  version: 1,
  coverage: 'complete',
  fullInci: 'Aqua, Niacinamide, Glycerin',
  ingredients: [
    { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
    { position: 2, inciLabel: 'Niacinamide', ingredientId: 'niacinamide', concentration: { known: true, value: 5, unit: 'percent_w_w' } },
    { position: 3, inciLabel: 'Glycerin', ingredientId: 'glycerin', concentration: { known: false } },
  ],
  sourceId: 'e1',
  reviewedBy: 'fixture',
  reviewedAt: '2026-01-01',
  ...over,
});

const directions = (over: Partial<ProductDirections> = {}): ProductDirections => ({
  session: 'am',
  frequency: 'fixture',
  text: 'fixture',
  reviewedBy: 'fixture',
  reviewedAt: '2026-01-01',
  source: 'fixture',
  formulationVersion: 1,
  maxWeeklyUses: null,
  evidenceIds: ['e1'],
  ...over,
});

const withIngredient = (i: number, patch: object): Partial<Formulation> => ({
  ingredients: good().ingredients.map((x, n) => (n === i ? { ...x, ...patch } : x)),
});

describe('publication checks', () => {
  it('accepts a valid complete formulation', () => {
    expect(formulationProblems(good(), EVIDENCE)).toEqual([]);
  });

  it.each<[string, Partial<Formulation>, RegExp]>([
    ['an invalid unit', withIngredient(1, { concentration: { known: true, value: 5, unit: 'percent' } }), /invalid unit/],
    ['a concentration above 100%', withIngredient(1, { concentration: { known: true, value: 120, unit: 'percent_w_w' } }), /above 100%/],
    ['a zero concentration', withIngredient(1, { concentration: { known: true, value: 0, unit: 'percent_w_w' } }), /positive number/],
    ['an ambiguous INCI label', withIngredient(1, { inciLabel: 'Vitamin C', ingredientId: null }), /ambiguous label/],
    ['a label that contradicts its id', withIngredient(1, { ingredientId: 'retinol' }), /resolves to niacinamide/],
    ['an unknown ingredient id', withIngredient(0, { ingredientId: 'not-a-real-id' }), /unknown ingredient id/],
    ['a gap in positions', withIngredient(2, { position: 4 }), /positions must run/],
    ['complete coverage without the INCI list', { fullInci: null }, /needs the full INCI list/],
    ['an INCI list that disagrees with the positions', { fullInci: 'Aqua, Niacinamide' }, /lists 2 ingredients/],
    ['a missing evidence source', { sourceId: 'nope' }, /evidence source nope does not exist/],
    ['unknown coverage with ingredients listed', { coverage: 'unknown' }, /use partial/],
  ])('rejects %s', (_, over, problem) => {
    expect(formulationProblems(good(over), EVIDENCE).join('\n')).toMatch(problem);
  });

  it('rejects broken links between directions, formulations and evidence', () => {
    const problems = knowledgeProblems({
      formulations: [good(), good()],
      evidence: [...EVIDENCE, { ...EVIDENCE[0], id: 'e2', url: 'http://insecure.test' }],
      directions: {
        'niacinamide-drops': directions({ formulationVersion: 3, evidenceIds: ['missing'], maxWeeklyUses: 40 }),
      },
    }).join('\n');
    expect(problems).toMatch(/Duplicate formulation niacinamide-drops@1/);
    expect(problems).toMatch(/must be https/);
    expect(problems).toMatch(/formulation v3, which does not exist/);
    expect(problems).toMatch(/evidence missing does not exist/);
    expect(problems).toMatch(/maxWeeklyUses/);
  });

  it('the real registries are valid and honest: empty, so nothing is ready', () => {
    expect(knowledgeProblems({ formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS })).toEqual([]);
    for (const [id, t] of Object.entries(TREATMENTS)) {
      const r = treatmentReadiness(id, t.class, { formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS });
      expect(r.ready, id).toBe(false);
    }
  });
});

describe('treatment readiness', () => {

  it('is ready only with directions, a complete formulation and a known active concentration', () => {
    const k = { formulations: [good()], evidence: EVIDENCE, directions: { 'niacinamide-drops': directions() } };
    expect(treatmentReadiness('niacinamide-drops', 'niacinamide', k)).toEqual({ ready: true });
  });

  it.each<[string, Formulation[], ProductDirections | undefined, string]>([
    ['no directions', [good()], undefined, 'directions_pending'],
    ['no formulation', [], directions(), 'formulation_incomplete'],
    ['partial coverage', [good({ coverage: 'partial' })], directions(), 'formulation_incomplete'],
    ['active concentration unknown', [good(withIngredient(1, { concentration: { known: false } }))], directions(), 'formulation_incomplete'],
    ['active not identified', [good(withIngredient(1, { ingredientId: null }))], directions(), 'formulation_incomplete'],
    ['directions for another version', [good({ version: 2 })], directions(), 'formulation_incomplete'],
  ])('is not ready with %s', (_, f, d, reason) => {
    const knowledge = { formulations: f, evidence: EVIDENCE, directions: (d ? { 'niacinamide-drops': d } : {}) as Record<string, ProductDirections> };
    expect(treatmentReadiness('niacinamide-drops', 'niacinamide', knowledge)).toMatchObject({ ready: false, reason });
  });
});
