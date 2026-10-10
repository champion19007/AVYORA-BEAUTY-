import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import { APPROVED_DIRECTIONS, TREATMENTS, type ProductDirections } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { EXPLANATION_TEMPLATES } from '@/data/knowledge';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { INTERACTION_RULES } from '@/modules/ingredients/interaction-rules';
import type { Formulation, Knowledge } from '@/modules/ingredients/formulations';
import {
  selectProducts,
  type Offer,
  type SelectionInput,
  type SelectionProfile,
  type SelectionResult,
  type Slot,
} from '../selection';
import { applyEdit, planWeek, spreadDays, validatePlan, type PlanContext, type PlanDay } from '../planner';
import { inferConcerns } from '../bayes';

const { variants } = catalogRecords(PRODUCTS);
const OFFERS: Record<string, Offer> = Object.fromEntries(
  PRODUCTS.flatMap((p) =>
    p.sizes.map((s) => [
      variants.find((v) => v.productId === p.id && v.sizeLabel === s.label)!.id,
      { pricePaise: s.price * 100, stock: 10 },
    ])
  )
);
const REAL: Knowledge = { formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS };

/*
 * SYNTHETIC TEST KNOWLEDGE, NOT REAL FORMULATIONS OR DIRECTIONS.
 * Frequencies (3 a week, 2 to start, 4 a week) are invented to test the
 * planner's arithmetic and must never be read as advice.
 */
const full = (productId: string, rows: [string, string | null, number?][]): Formulation => ({
  productId,
  version: 1,
  coverage: 'complete',
  fullInci: rows.map(([l]) => l).join(', '),
  ingredients: rows.map(([inciLabel, ingredientId, pct], i) => ({
    position: i + 1,
    inciLabel,
    ingredientId,
    concentration: pct ? { known: true as const, value: pct, unit: 'percent_w_w' as const } : { known: false as const },
  })),
  sourceId: 'test',
  reviewedBy: 'TEST',
  reviewedAt: '2026-01-01',
});
const dir = (
  session: ProductDirections['session'],
  maxWeeklyUses: number | null,
  introductionWeeklyUses?: number
): ProductDirections => ({
  session,
  frequency: `TEST: up to ${maxWeeklyUses} times a week`,
  text: 'TEST DIRECTIONS, not real',
  reviewedBy: 'TEST',
  reviewedAt: '2026-01-01',
  source: 'test',
  formulationVersion: 1,
  maxWeeklyUses,
  evidenceIds: ['test'],
  ...(introductionWeeklyUses ? { introductionWeeklyUses } : {}),
});
const TEST: Knowledge = {
  formulations: [
    full('niacinamide-drops', [
      ['Aqua', 'water'],
      ['Niacinamide', 'niacinamide', 5],
    ]),
    full('retinol', [
      ['Aqua', 'water'],
      ['Retinal', 'retinal', 0.1],
    ]),
    full('pha-refining-fluid', [
      ['Aqua', 'water'],
      ['Glycolic Acid', 'glycolic-acid', 5],
    ]),
  ],
  evidence: [
    { id: 'test', title: 'Test only', url: null, sourceType: 'label', retrievedAt: '2026-01-01', limitations: 'Test' },
  ],
  directions: { 'niacinamide-drops': dir('pm', 3), retinol: dir('pm', 3), 'pha-refining-fluid': dir('pm', 3) },
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
const selInput = (
  knowledge: Knowledge,
  profile: Partial<SelectionProfile> = {},
  over: Partial<SelectionInput> = {}
): SelectionInput => ({
  profile: { ...PROFILE, ...profile },
  products: PRODUCTS,
  variants,
  roles: ROUTINE_ROLES,
  treatments: TREATMENTS,
  knowledge,
  interactions: INTERACTION_RULES,
  safety: { excludedClasses: [], maxTreatments: null, ruleIds: [] },
  offers: OFFERS,
  ...over,
});
const ctxFor = (knowledge: Knowledge, over: Partial<PlanContext> = {}): PlanContext => ({
  products: PRODUCTS,
  knowledge,
  interactions: INTERACTION_RULES,
  treatments: TREATMENTS,
  ownedItems: [],
  currentlyIrritated: 'no',
  maxDailySteps: 4,
  templates: [],
  ...over,
});
const plan = (knowledge: Knowledge, profile: Partial<SelectionProfile> = {}, ctxOver: Partial<PlanContext> = {}) =>
  planWeek(
    selectProducts(selInput(knowledge, profile)),
    ctxFor(knowledge, { maxDailySteps: profile.maxDailySteps ?? 4, ownedItems: profile.ownedItems ?? [], ...ctxOver })
  );

const daysWith = (days: PlanDay[], productId: string, session: 'am' | 'pm' = 'pm') =>
  days.filter((d) => d[session].some((s) => s.productId === productId)).map((d) => d.day);

/** A selection carrying the given treatments, for planner-only tests. */
const withTreatments = (base: SelectionResult, ids: string[]): SelectionResult => ({
  ...base,
  treatments: ids.map<Slot>((productId) => ({
    role: 'treatment',
    source: 'catalogue',
    productId,
    skuId: variants.find((v) => v.productId === productId)!.id,
    pricePaise: 1,
    score: 1,
    session: ['pm'],
    reasons: [],
  })),
});

describe('the week', () => {
  it('has seven days with ordered morning and evening sessions', () => {
    const p = plan(REAL);
    expect(p.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const d of p.days) {
      expect(d.am.map((s) => s.role)).toEqual(['cleanse', 'moisturise', 'protect']);
      expect(d.pm.map((s) => s.role).filter((r) => r !== 'optional')).toEqual(['cleanse', 'moisturise']);
      expect(d.pm.map((s) => s.position)).toEqual(d.pm.map((_, i) => i + 1));
      expect(d.am.map((s) => s.position)).toEqual([1, 2, 3]);
    }
    expect(p.problems).toEqual([]);
  });

  it('today schedules no treatment, says why, and lists the missing knowledge', () => {
    const p = plan(REAL);
    expect(p.days.every((d) => [...d.am, ...d.pm].every((s) => s.role !== 'treatment'))).toBe(true);
    expect(p.excluded.find((e) => e.productId === 'retinol')?.reasons.map((r) => r.code)).toContain(
      'directions_pending'
    );
    expect(p.missingKnowledge.some((m) => m.startsWith('Approved directions for'))).toBe(true);
    // Essentials carry no invented directions.
    expect(p.days[0].am.every((s) => s.directions === null)).toBe(true);
  });
});

describe('treatment frequency', () => {
  it('places an approved 3-a-week treatment on three spread evenings, with its directions verbatim', () => {
    const p = plan(TEST);
    expect(daysWith(p.days, 'niacinamide-drops')).toEqual([1, 3, 5]);
    const slot = p.days[0].pm.find((s) => s.productId === 'niacinamide-drops')!;
    expect(slot).toMatchObject({
      role: 'treatment',
      directions: { frequency: 'TEST: up to 3 times a week', text: 'TEST DIRECTIONS, not real' },
    });
    expect(p.days[0].pm.map((s) => s.role).filter((r) => r !== 'optional')).toEqual([
      'cleanse',
      'treatment',
      'moisturise',
    ]);
  });

  it('describes the schedule it actually generated', () => {
    expect(plan(TEST).schedule).toContain('10% Niacinamide Glow Drops: Monday, Wednesday, Friday evenings.');
  });

  it('starts at the approved introduction pace when one is set', () => {
    const k = { ...TEST, directions: { ...TEST.directions, 'niacinamide-drops': dir('pm', 3, 2) } };
    expect(daysWith(plan(k).days, 'niacinamide-drops')).toHaveLength(2);
  });

  it('honours an approved morning-only session', () => {
    const k = { ...TEST, directions: { ...TEST.directions, 'niacinamide-drops': dir('am', 7) } };
    const p = plan(k);
    expect(daysWith(p.days, 'niacinamide-drops', 'am')).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(daysWith(p.days, 'niacinamide-drops', 'pm')).toEqual([]);
  });

  it('leaves out a treatment whose approved directions state no weekly frequency, inventing none', () => {
    const k = { ...TEST, directions: { ...TEST.directions, 'niacinamide-drops': dir('pm', null) } };
    const p = plan(k);
    expect(daysWith(p.days, 'niacinamide-drops')).toEqual([]);
    expect(p.excluded.find((e) => e.productId === 'niacinamide-drops')?.reasons.map((r) => r.code)).toContain(
      'frequency_missing'
    );
    expect(p.missingKnowledge).toContain('Approved weekly frequency for 10% Niacinamide Glow Drops');
    expect(p.purchases.some((x) => x.productId === 'niacinamide-drops')).toBe(false);
  });

  it('never exceeds the weekly maximum, in any plan or edit', () => {
    const ctx = ctxFor(TEST);
    const base = plan(TEST);
    const extra = {
      ...base.days[1],
      pm: [...base.days[1].pm, base.days[0].pm.find((s) => s.productId === 'niacinamide-drops')!],
    };
    const overused = base.days
      .map((d) => (d.day === 2 ? extra : d))
      .map((d) => ({ ...d, pm: d.pm.map((s, i) => ({ ...s, position: i + 1 })) }));
    // Reordered so only the frequency rule is broken.
    const sorted = overused.map((d) => ({
      ...d,
      pm: [...d.pm]
        .sort(
          (a, b) =>
            ['cleanse', 'treatment', 'moisturise'].indexOf(a.role) -
            ['cleanse', 'treatment', 'moisturise'].indexOf(b.role)
        )
        .map((s, i) => ({ ...s, position: i + 1 })),
    }));
    expect(validatePlan(sorted, ctx)).toContain('niacinamide-drops: 4 uses this week, approved maximum 3');
  });
});

describe('conflicts and irritation across the week', () => {
  it('two irritating actives are scheduled on different evenings, never together', () => {
    const base = selectProducts(selInput(TEST));
    const p = planWeek(withTreatments(base, ['retinol', 'pha-refining-fluid']), ctxFor(TEST));
    const r = daysWith(p.days, 'retinol');
    const pha = daysWith(p.days, 'pha-refining-fluid');
    expect(r).toHaveLength(3);
    expect(pha).toHaveLength(3);
    expect(r.filter((d) => pha.includes(d))).toEqual([]);
    expect(p.problems).toEqual([]);
  });

  it('drops a treatment that cannot be placed without a same-session conflict, with a reason', () => {
    // TEST-ONLY conflict between the two actives, each 4 times a week: 8 evenings needed, 7 exist.
    const k = { ...TEST, directions: { ...TEST.directions, retinol: dir('pm', 4), 'niacinamide-drops': dir('pm', 4) } };
    const interactions = [
      { a: 'niacinamide', b: 'retinal', tier: 3 as const, summary: 'test', advice: 'test', citation: null },
    ];
    const base = selectProducts(selInput(k));
    const p = planWeek(withTreatments(base, ['niacinamide-drops', 'retinol']), ctxFor(k, { interactions }));
    expect(daysWith(p.days, 'niacinamide-drops')).toHaveLength(4);
    expect(daysWith(p.days, 'retinol')).toEqual([]);
    expect(p.excluded.find((e) => e.productId === 'retinol')?.reasons.map((r) => r.code)).toContain('cannot_schedule');
    expect(p.problems).toEqual([]);
  });

  it('an irritating active is never scheduled while skin is irritated, even if handed one', () => {
    const base = selectProducts(selInput(TEST));
    const p = planWeek(withTreatments(base, ['retinol']), ctxFor(TEST, { currentlyIrritated: 'yes' }));
    expect(daysWith(p.days, 'retinol')).toEqual([]);
    expect(p.excluded.find((e) => e.productId === 'retinol')?.reasons.map((r) => r.code)).toContain('cannot_schedule');
  });

  // Re-audit A02: a hard conflict is removed, never left in an actionable week.
  it('a conflict between an owned essential and a purchase removes the purchase; the plan is valid and partial', () => {
    const owned = [
      {
        id: 'my-cream',
        label: 'My night cream',
        ingredientIds: ['ceramides'],
        coverage: 'known' as const,
        prescribed: false,
        role: 'moisturise' as const,
      },
    ];
    // TEST-ONLY interaction between the owned cream and the sunscreen's zinc oxide.
    const interactions = [
      { a: 'ceramides', b: 'zinc-oxide', tier: 4 as const, summary: 'test', advice: 'test', citation: null },
    ];
    const k: Knowledge = {
      ...TEST,
      formulations: [
        ...TEST.formulations,
        full('sunscreen', [
          ['Aqua', 'water'],
          ['Zinc Oxide', 'zinc-oxide'],
        ]),
      ],
    };
    const sel = selectProducts(selInput(k, { ownedItems: owned }, { interactions }));
    const p = planWeek(sel, ctxFor(k, { interactions, ownedItems: owned }));
    expect(p.problems).toEqual([]);
    expect(p.status).toBe('partial');
    const all = p.days.flatMap((d) => [...d.am, ...d.pm]);
    expect(all.some((s) => s.ownedItemId === 'my-cream')).toBe(true);
    expect(all.some((s) => s.productId === 'sunscreen')).toBe(false);
    expect(p.excluded.find((e) => e.productId === 'sunscreen')?.reasons.map((r) => r.code)).toContain(
      'conflicts_in_routine'
    );
    expect(p.purchases.some((x) => x.productId === 'sunscreen')).toBe(false);
  });

  it('two conflicting owned essentials: one stays out with a reason, and nothing conflicting is scheduled', () => {
    const owned = [
      {
        id: 'a',
        label: 'Synthetic A',
        ingredientIds: ['ceramides'],
        coverage: 'known' as const,
        prescribed: false,
        role: 'cleanse' as const,
      },
      {
        id: 'b',
        label: 'Synthetic B',
        ingredientIds: ['hyaluronic-acid'],
        coverage: 'known' as const,
        prescribed: false,
        role: 'moisturise' as const,
      },
    ];
    const interactions = [
      { a: 'ceramides', b: 'hyaluronic-acid', tier: 2 as const, summary: 'test', advice: 'test', citation: null },
    ];
    const sel = selectProducts(selInput(TEST, { ownedItems: owned }, { interactions }));
    const p = planWeek(sel, ctxFor(TEST, { interactions, ownedItems: owned }));
    expect(p.problems).toEqual([]);
    expect(p.status).not.toBe('invalid');
    const ownedUses = p.days
      .flatMap((d) => [...d.am, ...d.pm])
      .filter((s) => s.source === 'owned')
      .map((s) => s.ownedItemId);
    expect(new Set(ownedUses).size).toBe(1);
    expect(p.ownedNotScheduled.map((o) => o.reasons[0].code)).toContain('conflicts_in_routine');
  });

  it('a prescription-only ingredient in an owned product is never scheduled, whatever its role', () => {
    const owned = [
      {
        id: 'rx',
        label: 'My cream',
        ingredientIds: ['tretinoin'],
        coverage: 'known' as const,
        prescribed: false,
        role: 'moisturise' as const,
      },
    ];
    const p = planWeek(selectProducts(selInput(TEST, { ownedItems: owned })), ctxFor(TEST, { ownedItems: owned }));
    expect(p.days.flatMap((d) => [...d.am, ...d.pm]).some((s) => s.ownedItemId === 'rx')).toBe(false);
    expect(p.ownedNotScheduled[0].reasons.map((r) => r.code)).toContain('prescription_item');
  });
});

describe('step caps and optional additions', () => {
  it('never exceeds the step cap in any session', () => {
    for (const cap of [3, 4, 5] as const) {
      const p = plan(TEST, { maxDailySteps: cap, priorities: ['dark-spots', 'dryness', 'hydration'] });
      for (const d of p.days) {
        expect(d.am.length).toBeLessThanOrEqual(cap);
        expect(d.pm.length).toBeLessThanOrEqual(cap);
      }
      expect(p.problems).toEqual([]);
    }
  });

  it('validation rejects a session over the cap, so an edited or forged week cannot exceed it', () => {
    const p = plan(TEST);
    expect(validatePlan(p.days, ctxFor(TEST, { maxDailySteps: 2 }))).toContain('Monday AM: 3 steps, limit 2');
  });

  it('keeps optional additions marked optional', () => {
    const p = plan(REAL, { maxDailySteps: 5, priorities: ['dryness', 'hydration'] });
    const optional = p.days.flatMap((d) => d.pm).filter((s) => s.optional);
    expect(optional.every((s) => s.role === 'optional')).toBe(true);
    expect(p.purchases.filter((x) => x.optional).map((x) => x.productId)).toEqual([
      ...new Set(optional.map((s) => s.productId)),
    ]);
  });
});

describe('budget, purchases and substitutions', () => {
  it('purchases are deduplicated, scheduled, and within budget at every budget', () => {
    for (const budget of [0, 50_000, 100_000, 150_000, 200_000, 500_000]) {
      const p = plan(TEST, { budgetPaise: budget });
      expect(p.newSpendPaise).toBeLessThanOrEqual(budget);
      expect(new Set(p.purchases.map((x) => x.skuId)).size).toBe(p.purchases.length);
      const scheduled = new Set(p.days.flatMap((d) => [...d.am, ...d.pm]).map((s) => s.skuId));
      for (const x of p.purchases) expect(scheduled.has(x.skuId)).toBe(true);
    }
  });

  it('a zero budget with no owned products is an honest no-match', () => {
    const p = plan(TEST, { budgetPaise: 0 });
    expect(p.status).toBe('no_match');
    expect(p.days.every((d) => d.am.length === 0 && d.pm.length === 0)).toBe(true);
  });

  it('a substitution re-plans the whole week and stays valid', () => {
    const first = plan(TEST);
    const moisturiser = first.days[0].am.find((s) => s.role === 'moisturise')!.productId!;
    const sel = selectProducts(selInput(TEST, {}, { excludeProductIds: [moisturiser] }));
    const p = planWeek(sel, ctxFor(TEST));
    expect(p.days[0].am.find((s) => s.role === 'moisturise')?.productId).not.toBe(moisturiser);
    expect(validatePlan(p.days, ctxFor(TEST))).toEqual([]);
  });
});

describe('edits are revalidated', () => {
  it('moving a treatment to a free evening is accepted', () => {
    const p = plan(TEST);
    const moved = applyEdit(
      p.days,
      { kind: 'move', productId: 'niacinamide-drops', fromDay: 1, toDay: 2, session: 'pm' },
      ctxFor(TEST)
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(daysWith(moved.days, 'niacinamide-drops')).toEqual([2, 3, 5]);
  });

  it('a move onto a day that already has it is refused', () => {
    const p = plan(TEST);
    expect(
      applyEdit(
        p.days,
        { kind: 'move', productId: 'niacinamide-drops', fromDay: 1, toDay: 3, session: 'pm' },
        ctxFor(TEST)
      ).ok
    ).toBe(false);
  });

  it('a move that creates a same-session conflict is refused with the problem, and the plan is unchanged', () => {
    const base = selectProducts(selInput(TEST));
    const p = planWeek(withTreatments(base, ['retinol', 'pha-refining-fluid']), ctxFor(TEST));
    const pha = daysWith(p.days, 'pha-refining-fluid')[0];
    const retinolDay = daysWith(p.days, 'retinol')[0];
    const result = applyEdit(
      p.days,
      { kind: 'move', productId: 'retinol', fromDay: retinolDay, toDay: pha, session: 'pm' },
      ctxFor(TEST)
    );
    expect(result).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.stringMatching(/two irritating actives/)]),
    });
  });

  it('removing a step keeps the remaining order valid', () => {
    const p = plan(TEST);
    const result = applyEdit(p.days, { kind: 'remove', day: 1, session: 'pm', position: 2 }, ctxFor(TEST));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days[0].pm.map((s) => s.position)).toEqual(p.days[0].pm.slice(1).map((_, i) => i + 1));
  });
});

describe('explanations', () => {
  it('render only approved templates; unapproved ones are listed as missing knowledge', () => {
    // The shipped templates are drafts: they must not render.
    const p = plan(
      TEST,
      { currentlyIrritated: 'yes' },
      { currentlyIrritated: 'yes', templates: EXPLANATION_TEMPLATES }
    );
    const e = p.explanations.find((x) => x.templateId === 'reason_irritated')!;
    expect(e).toMatchObject({ text: null });
    expect(p.missingKnowledge).toContain('Approved explanation template reason_irritated');

    const approved = EXPLANATION_TEMPLATES.map((t) => ({
      ...t,
      review: { status: 'approved' as const, reviewerId: 'TEST', reviewedAt: '2026-01-01', sourceIds: ['test'] },
    }));
    const p2 = plan(TEST, { currentlyIrritated: 'yes' }, { currentlyIrritated: 'yes', templates: approved });
    expect(p2.explanations.find((x) => x.templateId === 'reason_irritated')?.text).toMatch(
      /: left out while your skin is irritated\.$/
    );
  });
});

describe('determinism and safety', () => {
  it('identical inputs give byte-identical weeks, whatever the input order', () => {
    const a = JSON.stringify(plan(TEST));
    const b = JSON.stringify(
      planWeek(
        selectProducts(selInput(TEST, {}, { products: [...PRODUCTS].reverse(), variants: [...variants].reverse() })),
        ctxFor(TEST)
      )
    );
    expect(b).toBe(a);
  });

  it('strong concern scores cannot bring back a treatment that safety excludes', () => {
    // Inference strongly favouring the concern the retinoid treats, with test parameters.
    const inference = inferConcerns(
      {
        releaseId: 'kb_test',
        schemaVersion: 1,
        parameters: [
          {
            id: 'TEST',
            concern: 'aging',
            prior: 0.2,
            groups: [{ evidenceGroup: 'lines', observation: 'many', pGivenConcern: 0.99, pGivenNotConcern: 0.01 }],
            validationStatus: 'validated',
            provenance: { trainingVersion: 'T', calibrationVersion: 'T', counts: 1, note: 'test' },
            calibrationScope: { sources: ['quiz'], photoModelVersions: [] },
            review: { status: 'draft' },
          },
        ],
      },
      [{ evidenceGroup: 'lines', observation: 'many', source: 'quiz' }],
      []
    );
    expect(inference.priorities[0]).toBe('aging');
    const p = plan(TEST, { pregnancy: 'unknown', priorities: inference.priorities });
    expect(daysWith(p.days, 'retinol')).toEqual([]);
    expect(p.excluded.find((e) => e.productId === 'retinol')?.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['pregnancy_or_nursing', 'safety_answer_unknown'])
    );
  });

  it('spreads uses evenly and deterministically', () => {
    expect(spreadDays(1)).toEqual([1]);
    expect(spreadDays(2)).toEqual([1, 4]);
    expect(spreadDays(3)).toEqual([1, 3, 5]);
    expect(spreadDays(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(spreadDays(3, 1)).toEqual([2, 4, 6]);
  });
});
