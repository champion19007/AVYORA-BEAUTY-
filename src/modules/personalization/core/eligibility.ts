/**
 * One eligibility check for anything that might be scheduled: a catalogue
 * product or a product the customer already owns.
 *
 * A role ("moisturise", "cleanse") is where an item sits in a routine, not a
 * safety classification. Safety is decided from ingredient identities:
 * - Actives are detected from canonical ingredient classes, so a retinoid
 *   labelled "moisturiser" is still a retinoid.
 * - An allergy can be cleared only by a complete formulation whose every
 *   declared ingredient resolved to a canonical id. Unknown stays unknown.
 * - An item containing an elective active is never scheduled without an
 *   approved usage profile (owned items have none), so no frequency is
 *   invented for it.
 * - Prescription-only ingredients, or an item the customer marked as
 *   prescribed, are never scheduled by us.
 *
 * The active classes below are product categorisation from the ingredient
 * dictionary, not clinical rules; the profile conditions are the same
 * conservative engineering policies the catalogue already applied to
 * treatments (prompt 3), pending qualified review.
 *
 * Pure: shared by the browser and the server.
 */
import { INGREDIENTS, type IngredientClass } from '@/modules/ingredients/dictionary';
import { latestFormulation, unresolvedIngredients, type Knowledge } from '@/modules/ingredients/formulations';
import { possibleIds, resolveLabels } from '@/modules/ingredients/resolve';
import type { Product } from '@/data/mock-data';

export type TriState = 'yes' | 'no' | 'unknown';

export type EligibilityProfile = {
  pregnancy: TriState;
  nursing: TriState;
  currentlyIrritated: TriState;
  reactivity: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  ageBand: 'under18' | 'adult' | 'unknown';
  allergyHistory: TriState;
  allergyIngredientIds: readonly string[];
};

export type Reason = { code: string; ruleId: string; message: string };

/** What is known about an item's ingredients, and how completely. */
export type IngredientEvidence = {
  /** Canonical ids known (complete) or possibly (partial/unknown) present. */
  ids: string[];
  /** `complete` only when the full list is recorded and every entry resolved to an id. */
  identity: 'complete' | 'partial' | 'unknown';
};

/** Classes treated as elective, potentially irritating actives wherever they appear. */
export const ELECTIVE_ACTIVE_CLASSES: readonly IngredientClass[] = ['retinoid', 'vitamin_c', 'aha', 'bha', 'pha', 'enzyme', 'peroxide', 'depigmenting'];

const DICT = new Map(INGREDIENTS.map((i) => [i.id, i]));
const r = (code: string, ruleId: string, message: string): Reason => ({ code, ruleId, message });

export function catalogueEvidence(product: Product, knowledge: Knowledge): IngredientEvidence {
  const f = latestFormulation(product.id, knowledge.formulations);
  if (f?.coverage === 'complete') {
    return {
      ids: f.ingredients.flatMap((i) => (i.ingredientId ? [i.ingredientId] : [])),
      identity: unresolvedIngredients(f).length === 0 ? 'complete' : 'partial',
    };
  }
  // Highlights are hints of what may be present, never proof of what is absent.
  return { ids: possibleIds(resolveLabels(product.ingredients)), identity: f?.coverage === 'partial' ? 'partial' : 'unknown' };
}

export function ownedEvidence(item: { ingredientIds: readonly string[]; coverage: 'known' | 'partial' | 'unknown' }): IngredientEvidence {
  return { ids: [...item.ingredientIds], identity: item.coverage === 'known' ? 'complete' : item.coverage };
}

export type ActiveSummary = { classes: IngredientClass[]; retinoid: boolean; prescriptionOnly: string[] };

export function activesIn(ids: readonly string[]): ActiveSummary {
  const classes = new Set<IngredientClass>();
  const prescriptionOnly: string[] = [];
  for (const id of ids) {
    const ing = DICT.get(id);
    if (!ing) continue;
    if (ELECTIVE_ACTIVE_CLASSES.includes(ing.class)) classes.add(ing.class);
    if (ing.prescriptionOnly) prescriptionOnly.push(id);
  }
  return { classes: [...classes].sort(), retinoid: classes.has('retinoid'), prescriptionOnly };
}

/**
 * Hard reasons this item must stay out of the schedule for this person.
 * `hasApprovedUsage` says whether an approved usage profile governs the item
 * (catalogue directions); without one, an active cannot be given a frequency.
 */
export function ingredientExclusions(
  evidence: IngredientEvidence,
  profile: EligibilityProfile,
  opts: { label: string; hasApprovedUsage: boolean; markedPrescribed?: boolean; unknownSafetyAnswers: readonly string[] }
): Reason[] {
  const reasons: Reason[] = [];
  const actives = activesIn(evidence.ids);

  // Allergy: absence can be proven only from a complete, fully resolved list.
  if (profile.allergyHistory === 'yes' && profile.allergyIngredientIds.length === 0) {
    reasons.push(r('allergens_not_specified', 'builtin:allergy', 'You told us about an allergy but not which ingredients, so nothing can be checked against it.'));
  } else if (profile.allergyIngredientIds.length > 0) {
    if (evidence.ids.some((id) => profile.allergyIngredientIds.includes(id))) {
      reasons.push(r('allergen_present', 'builtin:allergy', `${opts.label} contains an ingredient you are allergic to.`));
    } else if (evidence.identity !== 'complete') {
      reasons.push(r('allergy_unverifiable', 'builtin:allergy', `${opts.label}: its full ingredient list is not verified, so it cannot be checked against your allergies.`));
    }
  }

  if (opts.markedPrescribed || actives.prescriptionOnly.length > 0) {
    reasons.push(r('prescription_item', 'builtin:prescription', `${opts.label} is a prescription product; use it as your prescriber directs. We do not schedule it.`));
  }

  if (actives.classes.length > 0) {
    const what = `${opts.label} contains an active (${actives.classes.join(', ')})`;
    if (profile.currentlyIrritated === 'yes') reasons.push(r('irritated', 'builtin:irritation', `${what}; left out while your skin is irritated.`));
    if (profile.reactivity === 'very_high') reasons.push(r('very_reactive', 'builtin:reactivity', `${what}; left out because your skin is very reactive.`));
    if (actives.retinoid && (profile.pregnancy !== 'no' || profile.nursing !== 'no')) {
      reasons.push(r('pregnancy_or_nursing', 'builtin:retinoid-pregnancy', `${what}; not included unless you have told us you are not pregnant or breastfeeding.`));
    }
    if (actives.retinoid && profile.ageBand !== 'adult') reasons.push(r('age', 'builtin:retinoid-age', `${what}; not included under 18, or when age is not given.`));
    if (opts.unknownSafetyAnswers.length > 0) {
      reasons.push(r('safety_answer_unknown', 'builtin:unknown-blocks-elective', `${what}; some safety questions are unanswered.`));
    }
    if (!opts.hasApprovedUsage) {
      reasons.push(r('usage_unapproved', 'builtin:usage-profile', `${what}; without approved directions we cannot say how often to use it, so it is not scheduled.`));
    }
  }
  return reasons;
}
