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
import type { ProfileValues } from '@/modules/knowledge/predicate';
import type { DecisionRule, ExplanationTemplate } from '@/modules/knowledge/records';
import { inferConcerns, readParameterSet, INFERENCE_VERSION, type Observation } from './bayes';
import { selectProducts, type Offer } from './selection';
import { planWeek, type WeeklyPlan } from './planner';
import { priorityTags, type SkinProfileV2 } from '../contracts';

/** Bumped whenever selection, planning or this composition changes behaviour. */
export const ROUTINE_ENGINE_V2 = 'select-plan-2026-10-08';

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
  unknownSafetyAnswers: string[];
  missingKnowledge: string[];
  problems: string[];
};

/** Rule fields with an exact equivalent in the profile; anything else stays unset, so no rule matches on a guess. */
function ruleProfile(p: SkinProfileV2): ProfileValues {
  return {
    ...(p.skinType !== 'unknown' ? { skinType: p.skinType } : {}),
    ...(p.reactivity !== 'unknown' ? { reactivity: p.reactivity } : {}),
    pregnancy: p.pregnancy,
    ...(p.ageBand === 'under18' ? { ageRange: 'under18' } : {}),
    ...(p.currentlyIrritated === 'yes' ? { currentCondition: 'irritated' } : {}),
  };
}

export function computeRoutine(input: {
  profile: SkinProfileV2;
  release: ReleaseView;
  products: readonly Product[];
  offers: Readonly<Record<string, Offer>>;
  observations?: readonly Observation[];
  /** Products the customer swapped out; they pass through the same checks as everything else. */
  excludeProductIds?: readonly string[];
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
  const knowledge = { formulations: a.catalogue.formulations, evidence: a.evidence.sources, directions: a.catalogue.usageProfiles };
  const interactions = [...a.ingredients.interactions, ...INTERACTION_RULES];
  const observations = input.observations ?? [];

  const inference = inferConcerns(readParameterSet(release.manifest, a.parameters), observations, profile.priorities);
  const rules = applyRules(a.rules.rules, ruleProfile(profile));
  const ownedItems = profile.ownedItems.map(({ role, ...item }) => (role && role !== 'other' ? { ...item, role } : item));

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
    safety: { excludedClasses: rules.excludedClasses, maxTreatments: rules.maxTreatments, ruleIds: rules.applied.map((r) => r.ruleId) },
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
    modelVersions: [...new Set(observations.flatMap((o) => (o.modelVersion ? [o.modelVersion] : [])))].sort(),
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
      return [{ id, source: s.source, role: s.role, reasons: (s.source === 'owned' ? s.notes : s.reasons).map((r) => r.message) }];
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
    unknownSafetyAnswers: selection.unknownSafetyAnswers,
    missingKnowledge: plan.missingKnowledge,
    problems: plan.problems,
  };
}
