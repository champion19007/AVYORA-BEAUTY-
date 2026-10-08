import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import { APPROVED_DIRECTIONS, TREATMENTS } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { INTERACTION_RULES } from '@/modules/ingredients/interaction-rules';
import type { Formulation, Knowledge } from '@/modules/ingredients/formulations';
import { DEFAULT_WEIGHTS, normaliseWeights, selectProducts, type Offer, type SelectionInput, type SelectionProfile, type Slot } from '../selection';

const { variants } = catalogRecords(PRODUCTS);

/** Every SKU on sale at its catalogue price with 10 in stock, unless a test says otherwise. */
const OFFERS: Record<string, Offer> = Object.fromEntries(
  PRODUCTS.flatMap((p) => p.sizes.map((s) => [variants.find((v) => v.productId === p.id && v.sizeLabel === s.label)!.id, { pricePaise: s.price * 100, stock: 10 }]))
);

const REAL_KNOWLEDGE: Knowledge = { formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS };

/*
 * SYNTHETIC TEST KNOWLEDGE, NOT REAL FORMULATIONS. Complete ingredient lists
 * invented for a few products so allergy and treatment paths can be tested.
 */
const full = (productId: string, labels: [string, string | null, number?][]): Formulation => ({
  productId,
  version: 1,
  coverage: 'complete',
  fullInci: labels.map(([l]) => l).join(', '),
  ingredients: labels.map(([inciLabel, ingredientId, pct], i) => ({
    position: i + 1,
    inciLabel,
    ingredientId,
    concentration: pct ? { known: true as const, value: pct, unit: 'percent_w_w' as const } : { known: false as const },
  })),
  sourceId: 'test',
  reviewedBy: 'TEST',
  reviewedAt: '2026-01-01',
});
const TEST_KNOWLEDGE: Knowledge = {
  formulations: [
    full('face-wash', [['Aqua', null], ['Niacinamide', 'niacinamide']]),
    full('centella-cleansing-balm', [['Aqua', null], ['Glycerin', null]]),
    full('ceramide-cream', [['Aqua', null], ['Ceramide NP', 'ceramides']]),
    full('sorbet-moisturizer', [['Aqua', null], ['Sodium Hyaluronate', 'hyaluronic-acid']]),
    full('sunscreen', [['Aqua', null], ['Zinc Oxide', 'zinc-oxide']]),
    full('niacinamide-drops', [['Aqua', null], ['Niacinamide', 'niacinamide', 5]]),
  ],
  evidence: [{ id: 'test', title: 'Test only', url: null, sourceType: 'label', retrievedAt: '2026-01-01', limitations: 'Test' }],
  directions: {
    'niacinamide-drops': {
      session: 'pm', frequency: 'TEST', text: 'TEST', reviewedBy: 'TEST', reviewedAt: '2026-01-01', source: 'test',
      formulationVersion: 1, maxWeeklyUses: 7, evidenceIds: ['test'],
    },
  },
};

const PROFILE: SelectionProfile = {
  pregnancy: 'no',
  nursing: 'no',
  currentlyIrritated: 'no',
  reactivity: 'low',
  ageBand: 'adult',
  allergyHistory: 'no',
  allergyIngredientIds: [],
  prescribedTreatment: 'no',
  priorities: ['dark-spots', 'dryness'],
  budgetPaise: 500_000,
  maxDailySteps: 4,
  ownedItems: [],
};

const input = (over: Omit<Partial<SelectionInput>, 'profile'> & { profile?: Partial<SelectionProfile> } = {}): SelectionInput => ({
  products: PRODUCTS,
  variants,
  roles: ROUTINE_ROLES,
  treatments: TREATMENTS,
  knowledge: REAL_KNOWLEDGE,
  interactions: INTERACTION_RULES,
  safety: { excludedClasses: [], maxTreatments: null, ruleIds: [] },
  offers: OFFERS,
  ...over,
  profile: { ...PROFILE, ...over.profile },
});

const catalogueIds = (slots: Slot[]) => slots.flatMap((s) => (s.source === 'catalogue' ? [s.productId] : []));
const reasonsFor = (result: ReturnType<typeof selectProducts>, productId: string) =>
  result.excluded.find((e) => e.productId === productId)?.reasons.map((r) => r.code) ?? [];

describe('the essential routine', () => {
  it('fills cleanse, moisturise and protect with available SKUs within budget', () => {
    const r = selectProducts(input());
    expect(r.status).toBe('complete');
    expect(r.essentials.map((s) => s.source)).toEqual(['catalogue', 'catalogue', 'catalogue']);
    expect(r.newSpendPaise).toBe(r.purchases.reduce((n, x) => n + x.pricePaise, 0));
    expect(r.newSpendPaise).toBeLessThanOrEqual(r.budgetPaise);
    expect(new Set(r.purchases.map((x) => x.skuId)).size).toBe(r.purchases.length);
  });

  it('chooses the cheapest available size of a product', () => {
    const protect = selectProducts(input()).essentials.find((s) => s.role === 'protect');
    expect(protect).toMatchObject({ source: 'catalogue', productId: 'sunscreen', skuId: 'sunscreen-30ml', pricePaise: 32_900 });
  });

  it('returns product, SKU and rule ids with every inclusion and exclusion', () => {
    const r = selectProducts(input());
    for (const s of r.essentials) if (s.source === 'catalogue') expect(s.reasons[0].ruleId).toMatch(/\S/);
    for (const e of r.excluded) for (const reason of e.reasons) expect(reason.ruleId).toMatch(/\S/);
  });
});

describe('stock', () => {
  it('a sold-out or uncounted SKU is never selected, and the slot says why', () => {
    for (const stock of [0, null]) {
      const offers = { ...OFFERS, 'sunscreen-30ml': { pricePaise: 32_900, stock }, 'sunscreen-50ml': { pricePaise: 64_900, stock } };
      const r = selectProducts(input({ offers }));
      expect(r.essentials.find((s) => s.role === 'protect')).toMatchObject({ source: 'unfilled', reasons: [{ code: 'no_eligible_product' }] });
      expect(reasonsFor(r, 'sunscreen')).toEqual(['unavailable']);
      expect(r.status).toBe('partial');
    }
  });

  it('falls back to another in-stock size', () => {
    const offers = { ...OFFERS, 'sunscreen-30ml': { pricePaise: 32_900, stock: 0 } };
    expect(selectProducts(input({ offers })).essentials.find((s) => s.role === 'protect')).toMatchObject({ skuId: 'sunscreen-50ml' });
  });
});

describe('budget', () => {
  it('a zero budget buys nothing and says the essentials are over budget', () => {
    const r = selectProducts(input({ profile: { budgetPaise: 0 } }));
    expect(r).toMatchObject({ status: 'no_match', purchases: [], newSpendPaise: 0 });
    expect(r.essentials.every((s) => s.source === 'unfilled' && s.reasons[0].code === 'over_budget')).toBe(true);
  });

  it('a tight budget buys what fits, most important first, never more', () => {
    for (const budget of [0, 30_000, 50_000, 90_000, 120_000, 150_000, 999_999]) {
      const r = selectProducts(input({ profile: { budgetPaise: budget } }));
      expect(r.newSpendPaise).toBeLessThanOrEqual(budget);
      expect(Number.isInteger(r.newSpendPaise)).toBe(true);
    }
    const tight = selectProducts(input({ profile: { budgetPaise: 50_000 } }));
    expect(tight.essentials.find((s) => s.role === 'moisturise')?.source).toBe('catalogue');
    expect(tight.status).toBe('partial');
  });

  it('refuses a budget that is not whole paise', () => {
    expect(() => selectProducts(input({ profile: { budgetPaise: 100.5 } }))).toThrow(/budgetPaise/);
  });
});

describe('owned products', () => {
  const owned = (role: 'cleanse' | 'moisturise' | 'protect', over = {}) => ({
    id: `owned-${role}`,
    label: `My ${role}`,
    ingredientIds: [],
    coverage: 'known' as const,
    prescribed: false,
    role,
    ...over,
  });

  it('are used first, so nothing is bought for that step', () => {
    const r = selectProducts(input({ profile: { ownedItems: [owned('moisturise')] } }));
    expect(r.essentials.find((s) => s.role === 'moisturise')).toMatchObject({ source: 'owned', ownedItemId: 'owned-moisturise' });
    expect(r.purchases.some((p) => p.productId === 'ceramide-cream' || p.productId === 'sorbet-moisturizer')).toBe(false);
  });

  it('with a zero budget, an owned-products-only routine is complete', () => {
    const r = selectProducts(input({ profile: { budgetPaise: 0, ownedItems: [owned('cleanse'), owned('moisturise'), owned('protect')] } }));
    expect(r).toMatchObject({ status: 'complete', purchases: [], newSpendPaise: 0 });
  });

  it('an owned product containing a known allergen is not used', () => {
    const r = selectProducts(
      input({
        knowledge: TEST_KNOWLEDGE,
        profile: { allergyHistory: 'yes', allergyIngredientIds: ['ceramides'], ownedItems: [owned('moisturise', { ingredientIds: ['ceramides'] })] },
      })
    );
    expect(r.essentials.find((s) => s.role === 'moisturise')).toMatchObject({ source: 'catalogue', productId: 'sorbet-moisturizer' });
  });

  it('an owned product with unknown ingredients is kept, with a note, and blocks actives', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { ownedItems: [owned('moisturise', { coverage: 'unknown' })] } }));
    const slot = r.essentials.find((s) => s.role === 'moisturise');
    expect(slot).toMatchObject({ source: 'owned', notes: [{ code: 'owned_ingredients_unverified' }] });
    expect(reasonsFor(r, 'niacinamide-drops')).toContain('owned_compatibility_unverified');
  });

  it('a product with an established conflict with an owned product is excluded', () => {
    // TEST-ONLY interaction rule, not a real one.
    const interactions = [{ a: 'niacinamide', b: 'tretinoin', tier: 2 as const, summary: 'test', advice: 'test', citation: 'test' }];
    const r = selectProducts(
      input({ knowledge: TEST_KNOWLEDGE, interactions, profile: { ownedItems: [{ ...owned('protect'), role: undefined, ingredientIds: ['tretinoin'] }] } })
    );
    expect(reasonsFor(r, 'face-wash')).toContain('conflicts_with_owned');
    expect(reasonsFor(r, 'niacinamide-drops')).toContain('conflicts_with_owned');
  });
});

describe('allergies', () => {
  it('without verified ingredient lists, nothing can be shown to be free of the allergen: an honest no-match', () => {
    const r = selectProducts(input({ profile: { allergyHistory: 'yes', allergyIngredientIds: ['niacinamide'] } }));
    expect(r.status).toBe('no_match');
    expect(reasonsFor(r, 'ceramide-cream')).toContain('allergy_unverifiable');
  });

  it('with complete formulations, products containing the allergen are excluded and others chosen', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { allergyHistory: 'yes', allergyIngredientIds: ['niacinamide'] } }));
    expect(reasonsFor(r, 'face-wash')).toContain('allergen_present');
    expect(r.essentials.find((s) => s.role === 'cleanse')).toMatchObject({ productId: 'centella-cleansing-balm' });
    expect(reasonsFor(r, 'niacinamide-drops')).toContain('allergen_present');
  });

  it('an allergy without named ingredients cannot be checked: nothing is recommended', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { allergyHistory: 'yes', allergyIngredientIds: [] } }));
    expect(r.status).toBe('no_match');
    expect(reasonsFor(r, 'sunscreen')).toContain('allergens_not_specified');
  });
});

describe('treatments', () => {
  it('today, with no approved directions, no treatment is selected and the slot says so', () => {
    const r = selectProducts(input());
    expect(r.treatments).toEqual([{ role: 'treatment', source: 'unfilled', reasons: [expect.objectContaining({ code: 'no_eligible_treatment' })] }]);
    expect(reasonsFor(r, 'retinol')).toContain('directions_pending');
  });

  it('a treatment with directions but an incomplete formulation is excluded', () => {
    const partial: Knowledge = { ...TEST_KNOWLEDGE, formulations: TEST_KNOWLEDGE.formulations.map((f) => (f.productId === 'niacinamide-drops' ? { ...f, coverage: 'partial' as const } : f)) };
    expect(reasonsFor(selectProducts(input({ knowledge: partial })), 'niacinamide-drops')).toContain('formulation_incomplete');
  });

  it('a ready, safe treatment matching a priority is selected, in its approved session', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE }));
    expect(r.treatments).toEqual([expect.objectContaining({ source: 'catalogue', productId: 'niacinamide-drops', session: ['pm'] })]);
  });

  it('unknown safety answers keep treatments out but not essentials', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { pregnancy: 'unknown' } }));
    expect(r.unknownSafetyAnswers).toEqual(['pregnancy']);
    expect(reasonsFor(r, 'niacinamide-drops')).toContain('safety_answer_unknown');
    expect(r.status).toBe('complete');
  });

  it('no ranking weight can overpower a hard exclusion', () => {
    const r = selectProducts(
      input({ knowledge: TEST_KNOWLEDGE, profile: { pregnancy: 'yes', priorities: ['aging', 'lines'] }, weights: { concernFit: 1000, tolerance: 0, affordability: 0, ownedCompatibility: 0 } })
    );
    expect(catalogueIds(r.treatments)).not.toContain('retinol');
    expect(reasonsFor(r, 'retinol')).toContain('pregnancy_or_nursing');
  });

  it('approved rule exclusions and a treatment limit of 0 are honoured', () => {
    const ruled = selectProducts(input({ knowledge: TEST_KNOWLEDGE, safety: { excludedClasses: ['niacinamide'], maxTreatments: null, ruleIds: ['rule-x'] } }));
    expect(ruled.excluded.find((e) => e.productId === 'niacinamide-drops')?.reasons).toContainEqual(expect.objectContaining({ code: 'excluded_by_rule', ruleId: 'rule-x' }));
    const none = selectProducts(input({ knowledge: TEST_KNOWLEDGE, safety: { excludedClasses: [], maxTreatments: 0, ruleIds: [] } }));
    expect(catalogueIds(none.treatments)).toEqual([]);
  });

  it('a prescribed treatment keeps elective actives out', () => {
    expect(reasonsFor(selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { prescribedTreatment: 'yes' } })), 'niacinamide-drops')).toContain('prescribed_treatment');
  });

  it('respects the step limit per session', () => {
    const r = selectProducts(input({ knowledge: TEST_KNOWLEDGE, profile: { maxDailySteps: 3 } }));
    // Evening: cleanse + moisturise + treatment = 3; no optional addition fits.
    expect(catalogueIds(r.treatments)).toEqual(['niacinamide-drops']);
    expect(r.optional).toEqual([]);
  });
});

describe('substitution', () => {
  it('replaces a removed product with another that passes the same checks', () => {
    const first = selectProducts(input());
    const moisturiser = first.essentials.find((s) => s.role === 'moisturise');
    if (moisturiser?.source !== 'catalogue') throw new Error('expected a moisturiser');
    const swapped = selectProducts(input({ excludeProductIds: [moisturiser.productId] }));
    const next = swapped.essentials.find((s) => s.role === 'moisturise');
    expect(next).toMatchObject({ source: 'catalogue' });
    expect(next).not.toMatchObject({ productId: moisturiser.productId });
    expect(reasonsFor(swapped, moisturiser.productId)).toContain('removed_by_customer');
  });

  it('honestly reports no substitute when none qualifies', () => {
    const r = selectProducts(input({ excludeProductIds: ['ceramide-cream', 'sorbet-moisturizer'] }));
    expect(r.essentials.find((s) => s.role === 'moisturise')).toMatchObject({ source: 'unfilled', reasons: [{ code: 'no_eligible_product' }] });
  });

  it('an unavailable alternative is never offered as a substitute', () => {
    const offers = { ...OFFERS, 'sorbet-moisturizer-50ml': { pricePaise: 49_900, stock: 0 } };
    const r = selectProducts(input({ offers, excludeProductIds: ['ceramide-cream'] }));
    expect(r.essentials.find((s) => s.role === 'moisturise')?.source).toBe('unfilled');
  });
});

describe('ranking', () => {
  it('weights are normalised and validated', () => {
    const w = normaliseWeights({ concernFit: 2, tolerance: 1, affordability: 1, ownedCompatibility: 0 });
    expect(w.concernFit + w.tolerance + w.affordability + w.ownedCompatibility).toBeCloseTo(1, 12);
    expect(normaliseWeights()).toEqual(DEFAULT_WEIGHTS);
    expect(() => normaliseWeights({ concernFit: -1 })).toThrow();
    expect(() => normaliseWeights({ concernFit: 0, tolerance: 0, affordability: 0, ownedCompatibility: 0 })).toThrow();
  });

  it('is deterministic, whatever the order of products, variants or owned items', () => {
    const a = selectProducts(input({ knowledge: TEST_KNOWLEDGE }));
    const b = selectProducts(input({ knowledge: TEST_KNOWLEDGE, products: [...PRODUCTS].reverse(), variants: [...variants].reverse() }));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('priorities change which eligible product ranks first', () => {
    const dry = selectProducts(input({ profile: { priorities: ['dryness'] } })).essentials.find((s) => s.role === 'moisturise');
    const oily = selectProducts(input({ profile: { priorities: ['oil-control'] } })).essentials.find((s) => s.role === 'moisturise');
    expect(dry).toMatchObject({ productId: 'ceramide-cream' });
    expect(oily).toMatchObject({ productId: 'sorbet-moisturizer' });
  });
});

describe('catalogue roles', () => {
  it('every product has an explicit routine role', () => {
    for (const p of PRODUCTS) expect(ROUTINE_ROLES[p.id], p.id).toBeDefined();
  });

  it('every treatment is a treatment role, and lip and body care are not in the face routine', () => {
    for (const id of Object.keys(TREATMENTS)) expect(ROUTINE_ROLES[id], id).toBe('treatment');
    expect(ROUTINE_ROLES['lip-mask']).toBe('none');
  });
});
