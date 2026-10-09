/**
 * Regression cases for the 9 October 2026 desktop re-audit (A01–A03,
 * A08–A12), using the audit's own synthetic inputs.
 *
 * SYNTHETIC DATA ONLY. Labels, ingredient pairs, directions and Bayesian
 * parameters below are invented to exercise the engine's rules; they are
 * not clinical directions, formulations or calibrated probabilities.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import { APPROVED_DIRECTIONS, TREATMENTS } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { INTERACTION_RULES } from '@/modules/ingredients/interaction-rules';
import { formulationProblems, type Formulation, type Knowledge } from '@/modules/ingredients/formulations';
import { compileRelease } from '@/modules/knowledge/compile';
import { developmentFixtureInput } from '@/modules/knowledge/__fixtures__/development-fixture';
import type { KnowledgeInput } from '@/modules/knowledge/records';
import { parameterSetProblems } from '../bayes';
import { selectProducts, type OwnedItem, type SelectionProfile } from '../selection';
import { planWeek } from '../planner';
import { computeRoutine } from '../routine';
import { QUESTION_PURPOSES } from '../answer-adapter';
import { skinProfileV2Schema, type SkinProfileV2 } from '../../contracts';

const { variants } = catalogRecords(PRODUCTS);
const offers = Object.fromEntries(variants.map((v) => [v.id, { pricePaise: 10_000, stock: 10 }]));
const knowledge: Knowledge = { formulations: FORMULATIONS, evidence: EVIDENCE_SOURCES, directions: APPROVED_DIRECTIONS };
const profile: SelectionProfile = {
  pregnancy: 'no', nursing: 'no', currentlyIrritated: 'no', reactivity: 'low', ageBand: 'adult', allergyHistory: 'no',
  allergyIngredientIds: [], prescribedTreatment: 'no', priorities: ['dryness'], budgetPaise: 500_000, maxDailySteps: 4, ownedItems: [],
};
const select = (p: SelectionProfile, k: Knowledge = knowledge, products = PRODUCTS, o: Record<string, { pricePaise: number; stock: number }> = offers) =>
  selectProducts({ profile: p, products, variants, roles: ROUTINE_ROLES, treatments: TREATMENTS, knowledge: k, interactions: INTERACTION_RULES, safety: { excludedClasses: [], maxTreatments: null, ruleIds: [] }, offers: o });
const plan = (p: SelectionProfile, k: Knowledge = knowledge) =>
  planWeek(select(p, k), { products: PRODUCTS, knowledge: k, interactions: INTERACTION_RULES, treatments: TREATMENTS, ownedItems: p.ownedItems, currentlyIrritated: p.currentlyIrritated, maxDailySteps: p.maxDailySteps, templates: [] });
const uses = (p: ReturnType<typeof plan>, pred: (s: { ownedItemId?: string; productId?: string; role: string }) => boolean) =>
  p.days.flatMap((d) => [...d.am, ...d.pm]).filter(pred).length;
const owned = (o: Partial<OwnedItem> & { id: string }): OwnedItem => ({ label: `Synthetic ${o.id}`, ingredientIds: [], coverage: 'known', prescribed: false, ...o });

describe('A01: owned products pass the same ingredient checks as catalogue products', () => {
  it('an irritated profile never schedules an owned retinoid relabelled as a moisturiser', () => {
    const p = plan({ ...profile, currentlyIrritated: 'yes', ownedItems: [owned({ id: 'active-cream', ingredientIds: ['retinol'], role: 'moisturise' })] });
    expect(uses(p, (s) => s.ownedItemId === 'active-cream')).toBe(0);
    expect(p.ownedNotScheduled[0].reasons.map((r) => r.code)).toContain('irritated');
  });

  it('even when not irritated, an owned active has no approved frequency, so it is not scheduled daily', () => {
    const p = plan({ ...profile, ownedItems: [owned({ id: 'active-cream', ingredientIds: ['retinol'], role: 'moisturise' })] });
    expect(uses(p, (s) => s.ownedItemId === 'active-cream')).toBe(0);
    expect(p.ownedNotScheduled[0].reasons.map((r) => r.code)).toContain('usage_unapproved');
  });

  it('an owned product with unknown ingredients is not used against a declared allergy', () => {
    const r = select({ ...profile, allergyHistory: 'yes', allergyIngredientIds: ['niacinamide'], ownedItems: [owned({ id: 'unknown-cream', coverage: 'unknown', role: 'moisturise' })] });
    expect(r.essentials.find((s) => s.role === 'moisturise')?.source).not.toBe('owned');
    expect(r.ownedNotScheduled[0].reasons.map((x) => x.code)).toContain('allergy_unverifiable');
  });

  it('pregnancy, age and prescription cannot be bypassed by the role label either', () => {
    const retinoid = owned({ id: 'r', ingredientIds: ['retinol'], role: 'cleanse' });
    const codes = (p: SelectionProfile) => select(p).ownedNotScheduled.flatMap((o) => o.reasons.map((x) => x.code));
    expect(codes({ ...profile, pregnancy: 'unknown', ownedItems: [retinoid] })).toContain('pregnancy_or_nursing');
    expect(codes({ ...profile, ageBand: 'under18', ownedItems: [retinoid] })).toContain('age');
    expect(codes({ ...profile, ownedItems: [owned({ id: 'x', role: 'moisturise', prescribed: true })] })).toContain('prescription_item');
  });
});

describe('A02: an actionable plan never contains a hard violation', () => {
  it('conflicting owned essentials: the conflict is removed, not scheduled', () => {
    const interactions = [{ a: 'ceramides', b: 'hyaluronic-acid', tier: 2 as const, summary: 'synthetic', advice: 'synthetic', citation: null }];
    const items = [owned({ id: 'a', ingredientIds: ['ceramides'], role: 'cleanse' }), owned({ id: 'b', ingredientIds: ['hyaluronic-acid'], role: 'moisturise' })];
    const p0 = { ...profile, ownedItems: items };
    const sel = selectProducts({ profile: p0, products: PRODUCTS, variants, roles: ROUTINE_ROLES, treatments: TREATMENTS, knowledge, interactions, safety: { excludedClasses: [], maxTreatments: null, ruleIds: [] }, offers });
    const p = planWeek(sel, { products: PRODUCTS, knowledge, interactions, treatments: TREATMENTS, ownedItems: items, currentlyIrritated: 'no', maxDailySteps: 4, templates: [] });
    expect(p.problems).toEqual([]);
    expect(p.status).not.toBe('invalid');
  });
});

describe('A03: full INCI identity, not just count', () => {
  const mismatched: Formulation = {
    productId: 'face-wash', version: 1, coverage: 'complete', fullInci: 'Niacinamide',
    ingredients: [{ position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } }],
    sourceId: 'fixture-evidence-not-real', reviewedBy: 'AUDIT SYNTHETIC', reviewedAt: '2026-10-09',
  };
  const evidence = [{ id: 'fixture-evidence-not-real', title: 'synthetic', url: null, sourceType: 'label' as const, retrievedAt: '2026-10-09', limitations: 'synthetic' }];

  it('a full INCI that names a different ingredient than the structured row is refused', () => {
    expect(formulationProblems(mismatched, evidence).join(' ')).toMatch(/full INCI says "Niacinamide", structured row says "Aqua"/);
  });

  it('a resolvable label without its canonical id is refused', () => {
    const f = { ...mismatched, fullInci: 'Niacinamide', ingredients: [{ position: 1, inciLabel: 'Niacinamide', ingredientId: null, concentration: { known: false as const } }] };
    expect(formulationProblems(f, evidence).join(' ')).toMatch(/record its canonical id/);
  });

  it('a label the dictionary does not know keeps identity incomplete, so an allergy cannot be cleared', () => {
    const f: Formulation = { ...mismatched, fullInci: 'Aqua, Mystery Extract', ingredients: [
      { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
      { position: 2, inciLabel: 'Mystery Extract', ingredientId: null, concentration: { known: false } },
    ] };
    const r = select({ ...profile, allergyHistory: 'yes', allergyIngredientIds: ['niacinamide'] }, { ...knowledge, formulations: [f], evidence });
    expect(r.essentials.some((s) => s.source === 'catalogue' && s.productId === 'face-wash')).toBe(false);
  });

  it('commas inside an INCI name do not split it', () => {
    const f: Formulation = { ...mismatched, fullInci: 'Aqua, 1,2-Hexanediol', ingredients: [
      { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
      { position: 2, inciLabel: '1,2-Hexanediol', ingredientId: null, concentration: { known: false } },
    ] };
    expect(formulationProblems(f, evidence)).toEqual([]);
  });
});

describe('A08: approved usage limits hold for every scheduled item', () => {
  it('a restrictive usage profile on an essential is honoured (PM only, at most 2 a week)', () => {
    const synthetic = { session: 'pm' as const, frequency: 'SYNTHETIC', text: 'SYNTHETIC', reviewedBy: 'AUDIT', reviewedAt: '2026-10-09', source: 'AUDIT', formulationVersion: 1, maxWeeklyUses: 2, evidenceIds: [] };
    const k = { ...knowledge, directions: { 'face-wash': synthetic, 'centella-cleansing-balm': synthetic } };
    const p = plan(profile, k);
    const cleanses = p.days.flatMap((d) => [...d.am.map((s) => ({ ...s, session: 'am' })), ...d.pm.map((s) => ({ ...s, session: 'pm' }))]).filter((s) => s.role === 'cleanse');
    expect(cleanses.length).toBeLessThanOrEqual(2);
    expect(cleanses.every((s) => s.session === 'pm')).toBe(true);
    expect(p.problems).toEqual([]);
  });
});

describe('A12: a complete essentials set within budget is found when one exists', () => {
  it('₹300 buys a ₹100 + ₹100 + ₹100 core rather than a ₹150 moisturiser and a missing cleanser', () => {
    const ids = ['face-wash', 'ceramide-cream', 'sorbet-moisturizer', 'sunscreen'];
    const products = PRODUCTS.filter((p) => ids.includes(p.id)).map((p) => ({ ...p, concerns: p.id === 'ceramide-cream' ? ['dryness'] : [] }));
    const o = Object.fromEntries(variants.filter((v) => ids.includes(v.productId)).map((v) => [v.id, { pricePaise: v.productId === 'ceramide-cream' ? 15_000 : 10_000, stock: 10 }]));
    const r = select({ ...profile, budgetPaise: 30_000 }, knowledge, products, o);
    expect(r.status).toBe('complete');
    expect(r.newSpendPaise).toBeLessThanOrEqual(30_000);
  });
});

describe('A09–A11: answers reach rules and evidence, through computeRoutine', () => {
  const base: SkinProfileV2 = skinProfileV2Schema.parse({
    schemaVersion: 2, ageBand: 'adult', skinType: 'dry', reactivity: 'low', pregnancy: 'no', nursing: 'no', currentlyIrritated: 'no',
    allergyHistory: 'no', prescribedTreatment: 'no', priorities: [], budgetPaise: 500_000, maxDailySteps: 4, experience: 'experienced',
    adherence: 'high', allergyIngredientIds: [], preferences: { eyeCare: false, bodyCare: false }, ownedItems: [],
  });
  /** SYNTHETIC parameter: prior 0.2, likelihood ratio 3 for a reported blemish priority. Arithmetic only. */
  const withSyntheticParameter = (): KnowledgeInput => {
    const input = developmentFixtureInput();
    input.parameters = [{
      id: 'synthetic-blemish', concern: 'blemish_appearance', prior: 0.2,
      groups: [{ evidenceGroup: 'concern_blemish_appearance', observation: 'reported', pGivenConcern: 0.6, pGivenNotConcern: 0.2 }],
      validationStatus: 'validated',
      provenance: { trainingVersion: 'SYNTHETIC', calibrationVersion: 'SYNTHETIC', counts: 1, note: 'Synthetic test values; not calibrated.' },
      calibrationScope: { sources: ['quiz', 'photo'], photoModelVersions: ['synthetic-model-1'] },
      review: input.rules[0].review,
    }];
    return input;
  };
  const releaseOf = (input: KnowledgeInput) => {
    const c = compileRelease(input, { fixture: true });
    if (!c.ok) throw new Error(c.errors.join('; '));
    return { manifest: c.release.manifest, artifacts: Object.fromEntries(Object.entries(c.release.artifacts).map(([k, v]) => [k, JSON.parse(v)])) };
  };
  const release = releaseOf(withSyntheticParameter());
  const run = (p: Partial<SkinProfileV2>, observations: Parameters<typeof computeRoutine>[0]['observations'] = []) =>
    computeRoutine({ profile: { ...base, ...p }, release, products: PRODUCTS, offers, observations, allowFixtureParameters: true });
  const belief = (r: ReturnType<typeof run>) => r.beliefs.find((b) => b.concern === 'blemish_appearance')?.probability;

  it('A09: a newcomer matches the beginner rule; an experienced, regular user does not', () => {
    expect(run({ experience: 'new' }).ruleIds).toContain('beginner_no_treatments');
    expect(run({ experience: 'experienced' }).ruleIds).not.toContain('beginner_no_treatments');
    expect(run({ adherence: 'low' }).ruleIds).toContain('low_adherence_essentials_first');
    expect(run({ adherence: 'high' }).ruleIds).not.toContain('low_adherence_essentials_first');
  });

  it('A09: every profile question has a stated purpose', () => {
    const asked = Object.keys(skinProfileV2Schema.shape).filter((k) => k !== 'schemaVersion');
    expect(Object.keys(QUESTION_PURPOSES).sort()).toEqual(asked.sort());
  });

  it('A10: approved quiz evidence moves the posterior; missing evidence is neutral', () => {
    expect(belief(run({ priorities: [] }))).toBeCloseTo(0.2, 6);
    expect(belief(run({ priorities: ['blemish_appearance'] }))).toBeCloseTo(0.75 / 1.75, 6);
  });

  it('A10: a correlated photo finding about the same thing counts once', () => {
    const photo = [{ evidenceGroup: 'blemish_appearance', observation: 'reported', source: 'photo' as const, modelVersion: 'synthetic-model-1' }];
    const quizOnly = belief(run({ priorities: ['blemish_appearance'] }));
    expect(belief(run({ priorities: ['blemish_appearance'] }, photo))).toBeCloseTo(quizOnly!, 9);
    expect(belief(run({ priorities: [] }, photo))).toBeCloseTo(quizOnly!, 9);
  });

  it('A11: an impossible categorical distribution fails compilation and runtime reading', () => {
    const input = developmentFixtureInput();
    input.parameters[0].groups.push({ evidenceGroup: 'self_report_breakouts', observation: 'rare', pGivenConcern: 0.8, pGivenNotConcern: 0.9 });
    expect(compileRelease(input, { fixture: true }).ok).toBe(false);
    const declared = { ...input.parameters[0], groupKinds: { self_report_breakouts: 'categorical' as const } };
    expect(parameterSetProblems({ releaseId: 'x', schemaVersion: 1, parameters: [declared] }).join(' ')).toMatch(/sums to/);
    const valid = { ...declared, groups: [
      { evidenceGroup: 'self_report_breakouts', observation: 'frequent', pGivenConcern: 0.6, pGivenNotConcern: 0.2 },
      { evidenceGroup: 'self_report_breakouts', observation: 'rare', pGivenConcern: 0.4, pGivenNotConcern: 0.8 },
    ] };
    expect(parameterSetProblems({ releaseId: 'x', schemaVersion: 1, parameters: [valid] })).toEqual([]);
    const duplicate = { ...valid, groups: [...valid.groups, valid.groups[0]] };
    expect(parameterSetProblems({ releaseId: 'x', schemaVersion: 1, parameters: [duplicate] }).join(' ')).toMatch(/duplicate/);
  });

  it('explanations come from the decision trace: the answers that changed the result are named', () => {
    const r = run({ experience: 'new', ownedItems: [{ id: 'rx', label: 'My prescription gel', ingredientIds: [], coverage: 'unknown', prescribed: true, role: 'moisturise' }] });
    const answers = r.answersThatMattered.map((a) => a.answer);
    expect(answers).toContain('experienceLevel');
    expect(answers).toContain('ownedItems');
    expect(r.ownedNotScheduled[0].label).toBe('My prescription gel');
  });
});
