import { describe, it, expect } from 'vitest';
import { getRecommendation, BEGINNER_SESSION_STEP_CAP } from '../routine-engine';
import { unresolvedSlots } from '../routine-slots';
import { PRODUCTS } from '@/data/mock-data';
import { TREATMENTS, type ProductDirections } from '@/data/product-directions';
import type { EvidenceSource, Formulation } from '@/modules/ingredients/formulations';
import { QUESTIONS } from '@/app/routine-finder/questions';
import type { RecommendationResult, RoutineStep } from '../routine-types';

/**
 * Routine safety and simplicity.
 *
 * The audited failures (#01, #02, #06, #11): irritated skin got vitamin C and
 * an exfoliant beside "barrier repair only"; "prefer not to say" counted as
 * not pregnant; a beginner got six steps a session; very reactive skin still
 * got exfoliation. These tests check the whole plan, not wording.
 *
 * Two runs of every profile: with the real directions registry (empty, so no
 * treatment may appear), and with SYNTHETIC approved directions for every
 * treatment — a test fixture, not real directions — so the safety rules are
 * proven against routines where treatments are otherwise eligible.
 */

const SYNTHETIC: Record<string, ProductDirections> = Object.fromEntries(
  Object.keys(TREATMENTS).map((id) => [
    id,
    {
      session: id === 'retinol' ? 'pm' : 'am_or_pm',
      frequency: `TEST FREQUENCY ${id}`,
      text: `TEST DIRECTIONS ${id}`,
      reviewedBy: 'test fixture',
      reviewedAt: '2026-01-01',
      source: 'test fixture, not a real review',
      formulationVersion: 1,
      maxWeeklyUses: null,
      evidenceIds: ['test-evidence'],
    },
  ])
);

/*
 * A synthetic, complete formulation for each treatment whose active class
 * the dictionary can identify: three INCI positions, the active's
 * concentration known. Fixture data only; it describes no real product.
 */
const TEST_ACTIVE: Record<string, string> = {
  retinoid: 'Retinal',
  vitamin_c: 'Ascorbic Acid',
  exfoliant: 'Glycolic Acid',
  niacinamide: 'Niacinamide',
};
const ACTIVE_ID: Record<string, string> = {
  Retinal: 'retinal',
  'Ascorbic Acid': 'ascorbic-acid',
  'Glycolic Acid': 'glycolic-acid',
  Niacinamide: 'niacinamide',
};
const syntheticFormulation = (productId: string, active: string, over: Partial<Formulation> = {}): Formulation => ({
  productId,
  version: 1,
  coverage: 'complete',
  fullInci: `Aqua, Glycerin, ${active}`,
  ingredients: [
    { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
    { position: 2, inciLabel: 'Glycerin', ingredientId: 'glycerin', concentration: { known: false } },
    {
      position: 3,
      inciLabel: active,
      ingredientId: ACTIVE_ID[active],
      concentration: { known: true, value: 1, unit: 'percent_w_w' },
    },
  ],
  sourceId: 'test-evidence',
  reviewedBy: 'test fixture',
  reviewedAt: '2026-01-01',
  ...over,
});
const SYNTHETIC_FORMULATIONS: Formulation[] = Object.entries(TREATMENTS)
  .filter(([, t]) => TEST_ACTIVE[t.class])
  .map(([id, t]) => syntheticFormulation(id, TEST_ACTIVE[t.class]));
const SYNTHETIC_EVIDENCE: EvidenceSource[] = [
  {
    id: 'test-evidence',
    title: 'Test fixture',
    url: null,
    sourceType: 'label',
    retrievedAt: '2026-01-01',
    limitations: 'Not real',
  },
];
const approved = (answers: object, formulations: Formulation[] = SYNTHETIC_FORMULATIONS) =>
  getRecommendation(answers, { directions: SYNTHETIC, formulations, evidence: SYNTHETIC_EVIDENCE });

const CATALOGUE_IDS = new Set(PRODUCTS.map((p) => p.id));
const TREATMENT_IDS = new Set(Object.keys(TREATMENTS));

const base = {
  concern: 'Fine Lines & Aging',
  secondaryConcerns: [] as string[],
  skinType: 'normal',
  reactivity: 'rarely',
  age: '25_34',
  sun: 'moderate',
  experience: 'experienced',
  consistency: 'every',
  currentCondition: 'clear',
  darkCircles: 'mild',
  darkSpots: 'no',
  bodyCare: 'no',
  pregnancy: 'no',
};

const CONCERNS = [
  'Acne & Breakouts',
  'Dark Spots & Pigmentation',
  'Dullness & Uneven Tone',
  'Fine Lines & Aging',
  'Texture & Roughness',
  'Dryness',
  'Just Want a Simple Routine',
];

function matrix(overrides: object = {}) {
  const out: Record<string, unknown>[] = [];
  for (const skinType of ['oily', 'dry', 'normal', 'sensitive'])
    for (const experience of ['none', 'beginner', 'basic', 'regular', 'experienced'])
      for (const reactivity of ['rarely', 'sometimes', 'easily', 'very_high'])
        for (const concern of CONCERNS)
          out.push({
            ...base,
            skinType,
            experience,
            reactivity,
            concern,
            secondaryConcerns: ['Texture', 'Dark Spots'],
            ...overrides,
          });
  return out;
}

const core = (r: RecommendationResult) => [...r.morningRoutine, ...r.eveningRoutine];
const everything = (r: RecommendationResult): RoutineStep[] => [...core(r), ...r.optionalSteps, ...r.bodyRoutine];
const treatmentsIn = (steps: RoutineStep[]) => steps.filter((s) => s.productId && TREATMENT_IDS.has(s.productId));
const has = (r: RecommendationResult, id: string) => everything(r).some((s) => s.productId === id);
const omittedFor = (r: RecommendationResult, id: string) => r.omitted.find((o) => o.productId === id)?.reason;

describe('irritated skin', () => {
  it('gets no treatment of any kind, anywhere in the plan', () => {
    for (const answers of matrix({ currentCondition: 'irritated' })) {
      const r = approved(answers);
      expect(r.mode).toBe('recovery');
      expect(treatmentsIn(everything(r))).toEqual([]);
      expect(r.optionalSteps).toEqual([]);
    }
  });

  it('is told so, and the explanation matches the products', () => {
    const r = approved({ ...base, concern: 'Dark Spots & Pigmentation', currentCondition: 'irritated' });
    expect(r.whyThisRoutine).toContain('no actives or exfoliation');
    expect(r.warnings.join(' ')).toContain('no actives or exfoliation');
    // The audited contradiction: vitamin C and PHA beside "barrier repair only".
    expect(has(r, 'vitamin-c-serum')).toBe(false);
    expect(has(r, 'pha-refining-fluid')).toBe(false);
    expect(omittedFor(r, 'vitamin-c-serum')).toBe('irritated');
  });

  it('uses a cleanser without an exfoliating acid in its highlights', () => {
    const r = approved({ ...base, currentCondition: 'irritated' });
    const cleansers = core(r)
      .filter((s) => s.category === 'cleanse')
      .map((s) => s.productId);
    expect(cleansers.every((id) => id === 'centella-cleansing-balm')).toBe(true);
  });
});

describe('very high reactivity', () => {
  it('gets no treatment and no optional additions', () => {
    for (const answers of matrix({ reactivity: 'very_high' })) {
      const r = approved(answers);
      expect(r.mode === 'gentle' || r.mode === 'recovery').toBe(true);
      expect(treatmentsIn(everything(r))).toEqual([]);
      expect(r.optionalSteps).toEqual([]);
    }
  });

  it('is told why', () => {
    const r = approved({ ...base, reactivity: 'very_high' });
    expect(r.whyThisRoutine).toContain('very reactive');
    expect(omittedFor(r, 'retinol')).toBe('very_reactive');
  });

  it('treats an unanswered reactivity question as reactive, not tolerant', () => {
    const r = approved({ ...base, reactivity: undefined });
    expect(r.profile.reactivity).toBe('high');
    expect(treatmentsIn(core(r)).length).toBeLessThanOrEqual(1);
  });
});

describe('pregnancy', () => {
  it('offers three distinct answers, with "Prefer not to say" as unknown', () => {
    const q = QUESTIONS.find((x) => x.id === 'pregnancy')!;
    const values = q.options.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(q.options.find((o) => o.label === 'Prefer not to say')?.value).toBe('unknown');
  });

  it('keeps unknown as unknown, including a missing answer', () => {
    expect(approved({ ...base, pregnancy: 'unknown' }).profile.pregnancy).toBe('unknown');
    expect(approved({ ...base, pregnancy: undefined }).profile.pregnancy).toBe('unknown');
    expect(approved({ ...base, pregnancy: 'prefer_not' }).profile.pregnancy).toBe('unknown');
  });

  it('never makes a retinoid eligible on yes or unknown', () => {
    for (const pregnancy of ['yes', 'unknown', undefined]) {
      for (const answers of matrix({ pregnancy })) {
        expect(has(approved(answers), 'retinol')).toBe(false);
      }
    }
  });

  it('says which reason applied', () => {
    expect(omittedFor(approved({ ...base, pregnancy: 'yes' }), 'retinol')).toBe('pregnancy_yes');
    const unknown = approved({ ...base, pregnancy: 'unknown' });
    expect(omittedFor(unknown, 'retinol')).toBe('pregnancy_unknown');
    expect(unknown.warnings.join(' ')).toContain('preferred not to say');
  });

  it('allows the retinoid only on an explicit no (so the rule is not simply "never")', () => {
    expect(has(approved({ ...base, pregnancy: 'no' }), 'retinol')).toBe(true);
  });
});

describe('under 18', () => {
  it('never gets a retinoid, whatever else is answered', () => {
    for (const answers of matrix({ age: 'under18' })) expect(has(approved(answers), 'retinol')).toBe(false);
    expect(omittedFor(approved({ ...base, age: 'under18' }), 'retinol')).toBe('under18');
  });
});

describe('beginners', () => {
  const beginners = [...matrix({ experience: 'none' }), ...matrix({ experience: 'beginner' })];

  it(`never get more than ${BEGINNER_SESSION_STEP_CAP} steps in a session`, () => {
    for (const answers of beginners) {
      const r = approved(answers);
      expect(r.morningRoutine.length).toBeLessThanOrEqual(BEGINNER_SESSION_STEP_CAP);
      expect(r.eveningRoutine.length).toBeLessThanOrEqual(BEGINNER_SESSION_STEP_CAP);
    }
  });

  it('get the essentials only: no treatments in the routine', () => {
    for (const answers of beginners) {
      const r = approved(answers);
      expect(treatmentsIn(core(r))).toEqual([]);
      expect(r.morningRoutine.map((s) => s.category)).toEqual(['cleanse', 'hydrate', 'protect']);
    }
  });

  it('the audited "simple routine" case is small and costs only the essentials', () => {
    const r = approved({ ...base, concern: 'Just Want a Simple Routine', experience: 'none', darkCircles: 'no' });
    const essentials = r.recommendedProducts.filter((p) => !p.optional);
    expect(essentials.length).toBeLessThanOrEqual(3);
    expect(r.morningRoutine.length + r.eveningRoutine.length).toBeLessThanOrEqual(2 * BEGINNER_SESSION_STEP_CAP);
  });
});

describe('optional additions', () => {
  it('toner, essence, eye products and exfoliation are never in the essential routine', () => {
    for (const answers of matrix()) {
      for (const run of [getRecommendation(answers), approved(answers)]) {
        const coreCategories = core(run).map((s) => s.category);
        for (const c of ['tone', 'essence', 'eye', 'exfoliate']) expect(coreCategories).not.toContain(c);
        expect(run.optionalSteps.every((s) => s.optional)).toBe(true);
      }
    }
  });

  it('are marked optional in the purchase list', () => {
    const r = approved({ ...base, skinType: 'dry', darkCircles: 'noticeable' });
    const optionalIds = new Set(r.optionalSteps.map((s) => s.productId));
    for (const item of r.recommendedProducts) {
      if (optionalIds.has(item.productId) && !core(r).some((s) => s.productId === item.productId)) {
        expect(item.optional).toBe(true);
      }
    }
  });

  it('never offers an exfoliant beside a retinoid', () => {
    for (const answers of matrix()) {
      const r = approved(answers);
      const exfoliant = everything(r).some((s) => TREATMENTS[s.productId ?? '']?.class === 'exfoliant');
      expect(exfoliant && has(r, 'retinol')).toBe(false);
    }
  });
});

describe('approved directions', () => {
  it('with none approved (today), no treatment enters any routine, and the reason is given', () => {
    for (const answers of matrix()) {
      const r = getRecommendation(answers);
      expect(treatmentsIn(everything(r))).toEqual([]);
    }
    const r = getRecommendation({ ...base, concern: 'Dark Spots & Pigmentation' });
    expect(omittedFor(r, 'vitamin-c-serum')).toBe('directions_pending');
    expect(r.whyThisRoutine).toContain('usage directions are still being reviewed');
  });

  it('a recommended treatment carries its approved directions verbatim, nothing generic', () => {
    const r = approved({ ...base, pregnancy: 'no' });
    const retinoid = everything(r).find((s) => s.productId === 'retinol')!;
    expect(retinoid.frequency).toBe(SYNTHETIC.retinol.frequency);
    expect(retinoid.explanation).toBe(SYNTHETIC.retinol.text);
  });

  it('one active at a time for regular users and reactive skin', () => {
    for (const answers of [...matrix({ experience: 'basic' }), ...matrix({ reactivity: 'easily' })]) {
      expect(treatmentsIn(core(approved(answers))).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('formulation coverage', () => {
  const pigment = { ...base, concern: 'Dark Spots & Pigmentation' };
  const withVitC = (f: Formulation | null) =>
    approved(pigment, [...SYNTHETIC_FORMULATIONS.filter((x) => x.productId !== 'vitamin-c-serum'), ...(f ? [f] : [])]);

  it('with complete formulations and approved directions, a treatment can be recommended', () => {
    expect(has(withVitC(syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid')), 'vitamin-c-serum')).toBe(true);
  });

  it.each<[string, Formulation | null]>([
    ['no formulation at all', null],
    ['partial coverage', syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid', { coverage: 'partial' })],
    [
      'unknown coverage',
      syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid', {
        coverage: 'unknown',
        ingredients: [],
        fullInci: null,
      }),
    ],
    [
      'the active concentration unknown',
      syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid', {
        ingredients: [
          { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
          { position: 2, inciLabel: 'Glycerin', ingredientId: 'glycerin', concentration: { known: false } },
          { position: 3, inciLabel: 'Ascorbic Acid', ingredientId: 'ascorbic-acid', concentration: { known: false } },
        ],
      }),
    ],
    [
      'the active not identified',
      syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid', {
        ingredients: [
          { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
          { position: 2, inciLabel: 'Glycerin', ingredientId: 'glycerin', concentration: { known: false } },
          { position: 3, inciLabel: 'Ascorbic Acid', ingredientId: null, concentration: { known: false } },
        ],
      }),
    ],
    ['an ambiguous label ("Vitamin C") in the INCI', syntheticFormulation('vitamin-c-serum', 'Vitamin C')],
    [
      'a different version than the directions were approved for',
      syntheticFormulation('vitamin-c-serum', 'Ascorbic Acid', { version: 2 }),
    ],
  ])('keeps the treatment out with %s, and says why', (_, f) => {
    const r = withVitC(f);
    expect(has(r, 'vitamin-c-serum')).toBe(false);
    expect(omittedFor(r, 'vitamin-c-serum')).toBe('formulation_incomplete');
    expect(r.whyThisRoutine).toContain('full formulation has not been verified');
  });

  it('missing formulations never unlock a treatment for any profile', () => {
    for (const answers of matrix()) {
      expect(treatmentsIn(everything(approved(answers, [])))).toEqual([]);
    }
  });
});

describe('general invariants', () => {
  it('slots resolve, and every product is in the catalogue with a name and size', () => {
    expect(unresolvedSlots()).toEqual([]);
    for (const answers of matrix()) {
      for (const s of everything(approved(answers))) {
        expect(CATALOGUE_IDS.has(s.productId!)).toBe(true);
        expect(s.productName).toBeTruthy();
        expect(s.productSize).toBeTruthy();
      }
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(approved(base))).toBe(JSON.stringify(approved(base)));
  });

  it('ends every morning with sunscreen and keeps vitamin C out of the evening', () => {
    for (const answers of matrix()) {
      const r = approved(answers);
      expect(r.morningRoutine.at(-1)?.category).toBe('protect');
      expect(r.eveningRoutine.some((s) => s.productId === 'vitamin-c-serum')).toBe(false);
      expect(r.morningRoutine.some((s) => s.productId === 'retinol')).toBe(false);
    }
  });

  it('numbers steps from 1, de-duplicates purchases and always asks for a patch test', () => {
    for (const answers of matrix().slice(0, 80)) {
      const r = approved(answers);
      for (const routine of [r.morningRoutine, r.eveningRoutine, r.optionalSteps]) {
        expect(routine.map((s) => s.order)).toEqual(routine.map((_, i) => i + 1));
      }
      const ids = r.recommendedProducts.map((p) => p.productId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.warnings.join(' ').toLowerCase()).toContain('patch test');
    }
  });

  it('makes no efficacy claims in step explanations', () => {
    const claims = /collagen|cell turnover|de-puff|cellular|soften fine lines|highest-impact/i;
    for (const answers of matrix()) {
      for (const s of everything(getRecommendation(answers))) expect(s.explanation).not.toMatch(claims);
      expect(getRecommendation(answers).priorities.join(' ')).not.toMatch(claims);
    }
  });
});
