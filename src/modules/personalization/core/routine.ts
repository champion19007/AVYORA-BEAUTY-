/**
 * One routine from validated inputs and one knowledge release: inference,
 * safety rules, selection and the weekly planner, in that order. Pure and
 * deterministic, so the browser's provisional routine and the server's
 * saved one come from the same function and the same release.
 *
 * Everything clinical comes from the release: formulations, approved
 * directions, treatments, rules, parameters and templates. The repository's
 * five unreviewed interaction rules are added to the release's approved ones:
 * they can only separate or exclude products, never permit one.
 */
import type { Product } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import type { EvidenceSource, Formulation } from '@/modules/ingredients/formulations';
import type { ProductDirections, TreatmentClass } from '@/data/product-directions';
import { INTERACTION_RULES, type InteractionRule } from '@/modules/ingredients/interaction-rules';
import type { CatalogVariantRecord } from '@/modules/catalog/catalog-records';
import type { Manifest } from '@/modules/knowledge/compile';
import { applyRules } from '@/modules/knowledge/inference';
import type { DecisionRule, ExplanationTemplate } from '@/modules/knowledge/records';
import { inferConcerns, readParameterSet, INFERENCE_VERSION, type Observation } from './bayes';
import { selectProducts, type Offer } from './selection';
import { planWeek, type WeeklyPlan } from './planner';
import { priorityTags, type SkinProfileV2 } from '../contracts';
import { ANSWER_ADAPTER_VERSION, canonicalObservations, quizEvidence, ruleFields } from './answer-adapter';
import { fieldsOf } from '@/modules/knowledge/predicate';

/** Bumped whenever selection, planning or this composition changes behaviour. */
export const ROUTINE_ENGINE_V2 = 'select-plan-2026-10-10';

export type ReleaseView = { manifest: Manifest; artifacts: Record<string, unknown> };

type CatalogueArtifact = {
  products: { id: string }[];
  variants: CatalogVariantRecord[];
  formulations: Formulation[];
  usageProfiles: Record<string, ProductDirections>;
  treatments: Record<string, { class: TreatmentClass; electiveIrritating: boolean }>;
};

export type RoutineSnapshot = {
  schemaVersion: 2;
  kbRelease: string;
  engineVersion: string;
  inferenceVersion: string;
  /** Photo model versions behind any scan observations used; empty for quiz-only routines. */
  modelVersions: string[];
  mode: 'recovery' | 'gentle' | 'essentials' | null;
  status: WeeklyPlan['status'];
  beliefs: { concern: string; basis: 'calibrated' | 'reported'; probability: number | null }[];
  days: WeeklyPlan['days'];
  schedule: string[];
  purchaseList: { skuId: string; productId: string; quantity: 1; pricePaise: number; optional: boolean }[];
  newSpendPaise: number;
  budgetPaise: number;
  /** Why each scheduled item is in the plan (selection's reasons, or notes on an owned item). */
  inclusions: { id: string; source: 'owned' | 'catalogue'; role: string; reasons: string[] }[];
  /** Slots nothing could fill, and why (no eligible product, over budget). */
  unfilled: { role: string; reasons: string[] }[];
  exclusions: { productId: string; reasonCodes: string[]; messages: string[] }[];
  explanations: WeeklyPlan['explanations'];
  ruleIds: string[];
  /** Products the customer swapped out for this plan. */
  excludedProductIds: string[];
  /** The customer's own products kept out of the week, and why. */
  ownedNotScheduled: { ownedItemId: string; label: string; reasons: string[] }[];
  /** Answers that actually changed this result, from the decision trace (not a list of every answer). */
  answersThatMattered: { answer: string; effects: string[] }[];
  answerAdapterVersion: string;
  unknownSafetyAnswers: string[];
  missingKnowledge: string[];
  problems: string[];
};

/** Reason codes that come from a particular answer, so explanations can name the answers that mattered. */
const ANSWER_FOR_CODE: Readonly<Record<string, string>> = {
  irritated: 'currentlyIrritated',
  very_reactive: 'reactivity',
  pregnancy_or_nursing: 'pregnancy / nursing',
  age: 'ageBand',
  allergen_present: 'allergyIngredientIds',
  allergy_unverifiable: 'allergyIngredientIds',
  allergens_not_specified: 'allergyHistory',
  prescribed_treatment: 'prescribedTreatment',
  prescription_item: 'ownedItems',
  owned_compatibility_unverified: 'ownedItems',
  conflicts_with_owned: 'ownedItems',
  over_budget: 'budgetPaise',
  removed_by_customer: 'excludeProductIds',
};

export function computeRoutine(input: {
  profile: SkinProfileV2;
  release: ReleaseView;
  products: readonly Product[];
  offers: Readonly<Record<string, Offer>>;
  observations?: readonly Observation[];
  /** Products the customer swapped out; they pass through the same checks as everything else. */
  excludeProductIds?: readonly string[];
  /** Tests only: let a fixture release's synthetic parameters drive inference. Never set in production code. */
  allowFixtureParameters?: boolean;
}): RoutineSnapshot {
  const { profile, release } = input;
  const a = release.artifacts as {
    catalogue: CatalogueArtifact;
    ingredients: { interactions: InteractionRule[] };
    rules: { rules: DecisionRule[] };
    parameters: unknown;
    explanations: { templates: ExplanationTemplate[] };
    evidence: { sources: EvidenceSource[] };
  };
  const inRelease = new Set(a.catalogue.products.map((p) => p.id));
  const products = input.products.filter((p) => inRelease.has(p.id));
  const knowledge = {
    formulations: a.catalogue.formulations,
    evidence: a.evidence.sources,
    directions: a.catalogue.usageProfiles,
  };
  const interactions = [...a.ingredients.interactions, ...INTERACTION_RULES];
  // Quiz answers are evidence too; photo findings are mapped onto the same groups so correlated evidence counts once.
  const observations = [...quizEvidence(profile), ...canonicalObservations(input.observations ?? [])];

  const inference = inferConcerns(
    readParameterSet(release.manifest, a.parameters, { allowFixture: input.allowFixtureParameters === true }),
    observations,
    profile.priorities
  );
  const rules = applyRules(a.rules.rules, ruleFields(profile));
  const ownedItems = profile.ownedItems.map(({ role, ...item }) =>
    role && role !== 'other' ? { ...item, role } : item
  );

  const selection = selectProducts({
    profile: {
      pregnancy: profile.pregnancy,
      nursing: profile.nursing,
      currentlyIrritated: profile.currentlyIrritated,
      reactivity: profile.reactivity,
      ageBand: profile.ageBand,
      allergyHistory: profile.allergyHistory,
      allergyIngredientIds: profile.allergyIngredientIds,
      prescribedTreatment: profile.prescribedTreatment,
      priorities: priorityTags(inference.priorities),
      budgetPaise: profile.budgetPaise,
      maxDailySteps: profile.maxDailySteps,
      ownedItems,
    },
    products,
    variants: a.catalogue.variants,
    roles: ROUTINE_ROLES,
    treatments: a.catalogue.treatments,
    knowledge,
    interactions,
    safety: {
      excludedClasses: rules.excludedClasses,
      maxTreatments: rules.maxTreatments,
      ruleIds: rules.applied.map((r) => r.ruleId),
    },
    offers: input.offers,
    excludeProductIds: input.excludeProductIds,
  });
  const plan = planWeek(selection, {
    products,
    knowledge,
    interactions,
    treatments: a.catalogue.treatments,
    ownedItems,
    currentlyIrritated: profile.currentlyIrritated,
    maxDailySteps: profile.maxDailySteps,
    templates: a.explanations.templates,
  });

  return {
    schemaVersion: 2,
    kbRelease: release.manifest.releaseId,
    engineVersion: ROUTINE_ENGINE_V2,
    inferenceVersion: INFERENCE_VERSION,
    modelVersions: [
      ...new Set(observations.flatMap((o) => (o.source === 'photo' && o.modelVersion ? [o.modelVersion] : []))),
    ].sort(),
    mode: rules.mode,
    status: plan.status,
    beliefs: inference.concerns.map((c) => ({
      concern: c.concern,
      basis: c.basis,
      probability: c.basis === 'calibrated' ? c.probability : null,
    })),
    days: plan.days,
    schedule: plan.schedule,
    purchaseList: plan.purchases,
    newSpendPaise: plan.newSpendPaise,
    budgetPaise: plan.budgetPaise,
    inclusions: [...selection.essentials, ...selection.treatments, ...selection.optional].flatMap((s) => {
      if (s.source === 'unfilled') return [];
      const id = s.source === 'owned' ? s.ownedItemId : s.productId;
      const scheduled = plan.days.some((d) => [...d.am, ...d.pm].some((x) => (x.productId ?? x.ownedItemId) === id));
      if (!scheduled) return [];
      return [
        {
          id,
          source: s.source,
          role: s.role,
          reasons: (s.source === 'owned' ? s.notes : s.reasons).map((r) => r.message),
        },
      ];
    }),
    unfilled: [...selection.essentials, ...selection.treatments, ...selection.optional].flatMap((s) =>
      s.source === 'unfilled' ? [{ role: s.role, reasons: s.reasons.map((r) => r.message) }] : []
    ),
    exclusions: plan.excluded.map((e) => ({
      productId: e.productId,
      reasonCodes: [...new Set(e.reasons.map((r) => r.code))],
      messages: [...new Set(e.reasons.map((r) => r.message))],
    })),
    explanations: plan.explanations,
    ruleIds: rules.applied.map((r) => r.ruleId),
    excludedProductIds: [...(input.excludeProductIds ?? [])].sort(),
    ownedNotScheduled: plan.ownedNotScheduled.map((o) => ({
      ownedItemId: o.ownedItemId,
      label: o.label,
      reasons: [...new Set(o.reasons.map((r) => r.message))],
    })),
    answersThatMattered: answersThatMattered(plan, selection, rules, a.rules.rules),
    answerAdapterVersion: ANSWER_ADAPTER_VERSION,
    unknownSafetyAnswers: selection.unknownSafetyAnswers,
    missingKnowledge: plan.missingKnowledge,
    problems: plan.problems,
  };
}

/** Which answers changed the result, read from the actual reasons and applied rules. */
function answersThatMattered(
  plan: WeeklyPlan,
  selection: ReturnType<typeof selectProducts>,
  rules: ReturnType<typeof applyRules>,
  allRules: readonly DecisionRule[]
): { answer: string; effects: string[] }[] {
  const out = new Map<string, Set<string>>();
  const add = (answer: string, effect: string) => out.set(answer, (out.get(answer) ?? new Set()).add(effect));
  for (const e of plan.excluded)
    for (const r of e.reasons) if (ANSWER_FOR_CODE[r.code]) add(ANSWER_FOR_CODE[r.code], r.message);
  for (const o of plan.ownedNotScheduled)
    for (const r of o.reasons) add(ANSWER_FOR_CODE[r.code] ?? 'ownedItems', `${o.label}: ${r.message}`);
  for (const s of [...selection.essentials, ...selection.treatments]) {
    if (s.source === 'unfilled')
      for (const r of s.reasons) if (ANSWER_FOR_CODE[r.code]) add(ANSWER_FOR_CODE[r.code], r.message);
    if (s.source === 'owned') add('ownedItems', `${s.label} fills your ${s.role} step.`);
  }
  for (const applied of rules.applied) {
    const rule = allRules.find((r) => r.id === applied.ruleId);
    if (rule) for (const f of fieldsOf(rule.when)) add(f, `Rule ${rule.id} applied.`);
  }
  if (
    selection.unknownSafetyAnswers.length &&
    plan.excluded.some((e) => e.reasons.some((r) => r.code === 'safety_answer_unknown'))
  ) {
    add(selection.unknownSafetyAnswers.join(', '), 'Unanswered safety questions kept elective treatments out.');
  }
  return [...out]
    .map(([answer, effects]) => ({ answer, effects: [...effects].sort() }))
    .sort((a, b) => a.answer.localeCompare(b.answer));
}
