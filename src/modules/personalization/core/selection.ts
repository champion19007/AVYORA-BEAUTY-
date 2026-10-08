/**
 * Deterministic product selection: hard eligibility first, then ranking.
 *
 * Order of operations, and why:
 * 1. Eligibility per product, with a rule id and reason for every refusal.
 *    A refused product never reaches ranking, so no score can overpower it.
 * 2. The customer's own suitable products fill essential slots first.
 * 3. Eligible SKUs are ranked by the normalised score
 *    0.50 concern fit + 0.25 tolerance + 0.15 affordability + 0.10 owned
 *    compatibility (proposed weights, configurable, needing evaluation).
 * 4. Essentials are bought within the budget (integer paise), then at most
 *    the allowed treatments, then optional additions, each within the
 *    remaining budget and the per-session step limit.
 *
 * Unknown safety answers stay unknown: they block elective treatments
 * (eligibility cannot be established) but never essentials. Missing
 * formulation information never passes a check: an allergy or an owned
 * product's compatibility cannot be proven against a partial ingredient list.
 *
 * Pure: the caller supplies authoritative offers (price and counted stock
 * per SKU) and the knowledge in force. Margin and co-purchase counts are not
 * inputs at all.
 */
import type { Product } from '@/data/mock-data';
import type { TreatmentClass } from '@/data/product-directions';
import type { CatalogVariantRecord } from '@/modules/catalog/catalog-records';
import { treatmentReadiness, latestFormulation, type Knowledge } from '@/modules/ingredients/formulations';
import { possibleIds, resolveLabels } from '@/modules/ingredients/resolve';
import type { InteractionRule } from '@/modules/ingredients/interaction-rules';
import type { RoutineRole } from '@/data/routine-roles';

export type TriState = 'yes' | 'no' | 'unknown';
type EssentialRole = 'cleanse' | 'moisturise' | 'protect';
const ESSENTIAL_ROLES: EssentialRole[] = ['moisturise', 'protect', 'cleanse']; // filled in this order when money is short

export type OwnedItem = {
  id: string;
  label: string;
  ingredientIds: string[];
  coverage: 'known' | 'partial' | 'unknown';
  prescribed: boolean;
  /** The essential slot the customer uses it for, if any. */
  role?: EssentialRole;
};

export type SelectionProfile = {
  pregnancy: TriState;
  nursing: TriState;
  currentlyIrritated: TriState;
  reactivity: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  ageBand: 'under18' | 'adult' | 'unknown';
  allergyHistory: TriState;
  allergyIngredientIds: string[];
  prescribedTreatment: TriState;
  /** Concern ids in priority order (from inference or as reported). */
  priorities: string[];
  /** New-purchase budget, integer paise. */
  budgetPaise: number;
  /** Steps allowed in each morning and evening session. */
  maxDailySteps: 3 | 4 | 5;
  ownedItems: OwnedItem[];
};

/** Authoritative per-SKU offer from the server: price in paise and counted stock (null = not counted, not sellable). */
export type Offer = { pricePaise: number; stock: number | null };

export type SelectionWeights = { concernFit: number; tolerance: number; affordability: number; ownedCompatibility: number };
/** Proposed starting weights from the specification; require evaluation against expert-approved examples. */
export const DEFAULT_WEIGHTS: SelectionWeights = { concernFit: 0.5, tolerance: 0.25, affordability: 0.15, ownedCompatibility: 0.1 };

export type SelectionInput = {
  profile: SelectionProfile;
  products: readonly Product[];
  variants: readonly CatalogVariantRecord[];
  roles: Readonly<Record<string, RoutineRole>>;
  treatments: Readonly<Record<string, { class: TreatmentClass; electiveIrritating: boolean }>>;
  knowledge: Knowledge;
  interactions: readonly InteractionRule[];
  /** Classes excluded by approved safety rules for this profile (`applyRules`), and its treatment limit. */
  safety: { excludedClasses: readonly string[]; maxTreatments: number | null; ruleIds: readonly string[] };
  offers: Readonly<Record<string, Offer>>;
  weights?: Partial<SelectionWeights>;
  /** Products the customer removed, for substitution. They go through the same checks as everything else. */
  excludeProductIds?: readonly string[];
};

export type Reason = { code: string; ruleId: string; message: string };

export type Slot =
  | { role: string; source: 'owned'; ownedItemId: string; label: string; session: ('am' | 'pm')[]; notes: Reason[] }
  | {
      role: string;
      source: 'catalogue';
      productId: string;
      skuId: string;
      pricePaise: number;
      score: number;
      session: ('am' | 'pm')[];
      reasons: Reason[];
    }
  | { role: string; source: 'unfilled'; reasons: Reason[] };

export type SelectionResult = {
  status: 'complete' | 'partial' | 'no_match';
  essentials: Slot[];
  treatments: Slot[];
  optional: Slot[];
  purchases: { skuId: string; productId: string; quantity: 1; pricePaise: number; optional: boolean }[];
  newSpendPaise: number;
  budgetPaise: number;
  excluded: { productId: string; reasons: Reason[] }[];
  /** Safety questions answered "unknown" or not at all: they kept elective treatments out. */
  unknownSafetyAnswers: string[];
  weights: SelectionWeights;
};

/* -------------------------------------------------------------- helpers -- */

const r = (code: string, ruleId: string, message: string): Reason => ({ code, ruleId, message });

export function normaliseWeights(partial: Partial<SelectionWeights> = {}): SelectionWeights {
  const w = { ...DEFAULT_WEIGHTS, ...partial };
  for (const [k, v] of Object.entries(w)) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Weight ${k} must be a finite, non-negative number`);
  }
  const total = w.concernFit + w.tolerance + w.affordability + w.ownedCompatibility;
  if (total <= 0) throw new Error('At least one weight must be positive');
  return {
    concernFit: w.concernFit / total,
    tolerance: w.tolerance / total,
    affordability: w.affordability / total,
    ownedCompatibility: w.ownedCompatibility / total,
  };
}

/** Ingredients known to be in a product: from a complete formulation only. */
function knownIngredients(productId: string, knowledge: Knowledge): { ids: string[]; complete: boolean } {
  const f = latestFormulation(productId, knowledge.formulations);
  if (f?.coverage === 'complete') {
    return { ids: f.ingredients.flatMap((i) => (i.ingredientId ? [i.ingredientId] : [])), complete: true };
  }
  return { ids: [], complete: false };
}

/** Ingredients a product might contain, for compatibility: formulation if complete, else its highlights (possible ids). */
export function possibleIngredients(product: Product, knowledge: Knowledge): { ids: string[]; complete: boolean } {
  const known = knownIngredients(product.id, knowledge);
  if (known.complete) return known;
  return { ids: possibleIds(resolveLabels(product.ingredients)), complete: false };
}

export function conflictTier(a: readonly string[], b: readonly string[], rules: readonly InteractionRule[]): number | null {
  let worst: number | null = null;
  for (const rule of rules) {
    const hit = (a.includes(rule.a) && b.includes(rule.b)) || (a.includes(rule.b) && b.includes(rule.a));
    if (hit && (worst === null || rule.tier < worst)) worst = rule.tier;
  }
  return worst;
}

/* ---------------------------------------------------------- eligibility -- */

function unknownSafetyAnswers(p: SelectionProfile): string[] {
  const unknown: string[] = [];
  if (p.pregnancy === 'unknown') unknown.push('pregnancy');
  if (p.nursing === 'unknown') unknown.push('nursing');
  if (p.currentlyIrritated === 'unknown') unknown.push('currentlyIrritated');
  if (p.prescribedTreatment === 'unknown') unknown.push('prescribedTreatment');
  if (p.ageBand === 'unknown') unknown.push('ageBand');
  if (p.reactivity === 'unknown') unknown.push('reactivity');
  if (p.allergyHistory === 'unknown') unknown.push('allergyHistory');
  return unknown;
}

/** Every reason this product cannot be selected for this person. Empty means eligible. */
function exclusions(product: Product, input: SelectionInput, unknown: string[]): Reason[] {
  const { profile: p, knowledge } = input;
  const role = input.roles[product.id] ?? 'none';
  const reasons: Reason[] = [];

  if (role === 'none') return [r('not_in_face_routine', 'builtin:role', 'Not part of a face routine.')];
  if (input.excludeProductIds?.includes(product.id)) reasons.push(r('removed_by_customer', 'builtin:substitution', 'You removed this product.'));

  // Allergy: absence of an allergen can be proven only from a complete formulation.
  if (p.allergyHistory === 'yes' && p.allergyIngredientIds.length === 0) {
    reasons.push(r('allergens_not_specified', 'builtin:allergy', 'You told us about an allergy but not which ingredients, so no product can be checked against it.'));
  } else if (p.allergyIngredientIds.length > 0) {
    const known = knownIngredients(product.id, knowledge);
    if (!known.complete) {
      reasons.push(r('allergy_unverifiable', 'builtin:allergy', 'Its full ingredient list is not verified, so it cannot be checked against your allergies.'));
    } else if (known.ids.some((id) => p.allergyIngredientIds.includes(id))) {
      reasons.push(r('allergen_present', 'builtin:allergy', 'It contains an ingredient you are allergic to.'));
    }
  }

  // Compatibility with what the customer already uses: an established conflict excludes.
  const mine = possibleIngredients(product, knowledge);
  for (const item of p.ownedItems) {
    if (conflictTier(mine.ids, item.ingredientIds, input.interactions) === 2) {
      reasons.push(r('conflicts_with_owned', 'builtin:interaction', `It has an established conflict with ${item.label}.`));
    }
  }

  if (role === 'treatment') {
    const t = input.treatments[product.id];
    if (!t) {
      reasons.push(r('not_classified', 'builtin:treatment', 'Not classified as a treatment.'));
    } else {
      if (p.currentlyIrritated === 'yes' && t.electiveIrritating) reasons.push(r('irritated', 'builtin:irritation', 'Left out while your skin is irritated.'));
      if ((p.reactivity === 'very_high') && t.electiveIrritating) reasons.push(r('very_reactive', 'builtin:reactivity', 'Left out because your skin is very reactive.'));
      if (t.class === 'retinoid' && (p.pregnancy !== 'no' || p.nursing !== 'no')) {
        reasons.push(r('pregnancy_or_nursing', 'builtin:retinoid-pregnancy', 'Not included unless you have told us you are not pregnant or breastfeeding.'));
      }
      if (t.class === 'retinoid' && p.ageBand !== 'adult') reasons.push(r('age', 'builtin:retinoid-age', 'Not included under 18, or when age is not given.'));
      if (p.prescribedTreatment === 'yes' || p.ownedItems.some((o) => o.prescribed)) {
        reasons.push(r('prescribed_treatment', 'builtin:prescription', 'You use a prescribed treatment; we do not add or combine actives with it.'));
      }
      if (unknown.length > 0) {
        reasons.push(r('safety_answer_unknown', 'builtin:unknown-blocks-elective', 'Some safety questions are unanswered, so an elective treatment cannot be recommended.'));
      }
      for (const cls of input.safety.excludedClasses) {
        if (cls === t.class || (cls === 'elective_irritating' && t.electiveIrritating)) {
          reasons.push(r('excluded_by_rule', input.safety.ruleIds.join(',') || 'release:rules', 'Excluded by an approved safety rule for your answers.'));
        }
      }
      // Actives beside products whose ingredients are not fully known cannot be checked.
      if (p.ownedItems.some((o) => o.coverage !== 'known')) {
        reasons.push(r('owned_compatibility_unverified', 'builtin:interaction', 'Some of your current products have unknown ingredients, so an active cannot be checked against them.'));
      }
      const ready = treatmentReadiness(product.id, t.class, knowledge);
      if (!ready.ready) {
        reasons.push(
          ready.reason === 'directions_pending'
            ? r('directions_pending', 'builtin:directions', 'Its usage directions are still being reviewed.')
            : r('formulation_incomplete', 'builtin:formulation', 'Its full formulation has not been verified.')
        );
      }
    }
  }
  return reasons;
}

/* -------------------------------------------------------------- ranking -- */

function score(product: Product, pricePaise: number, cheapestInRole: number, input: SelectionInput, weights: SelectionWeights): number {
  const p = input.profile;
  const n = p.priorities.length;
  const ranks = product.concerns.map((c) => p.priorities.indexOf(c)).filter((i) => i >= 0);
  const concernFit = n === 0 || ranks.length === 0 ? 0 : 1 - Math.min(...ranks) / n;

  const t = input.treatments[product.id];
  const reactive = p.reactivity === 'high' || p.reactivity === 'unknown' ? 0.4 : p.reactivity === 'medium' ? 0.7 : 1;
  const tolerance = t?.electiveIrritating ? reactive : 1;

  const affordability = pricePaise > 0 ? Math.min(1, cheapestInRole / pricePaise) : 0;

  const mine = possibleIngredients(product, input.knowledge).ids;
  let ownedCompatibility = 1;
  if (p.ownedItems.some((o) => o.coverage !== 'known')) ownedCompatibility -= 0.5;
  if (p.ownedItems.some((o) => conflictTier(mine, o.ingredientIds, input.interactions) !== null)) ownedCompatibility -= 0.5;

  const total =
    weights.concernFit * concernFit +
    weights.tolerance * tolerance +
    weights.affordability * affordability +
    weights.ownedCompatibility * Math.max(0, ownedCompatibility);
  // Rounded so tiny floating-point differences cannot reorder ties.
  return Math.round(total * 1e6) / 1e6;
}

/* ------------------------------------------------------------- selection -- */

export function selectProducts(input: SelectionInput): SelectionResult {
  const weights = normaliseWeights(input.weights);
  const p = input.profile;
  if (!Number.isInteger(p.budgetPaise) || p.budgetPaise < 0) throw new Error('budgetPaise must be a non-negative integer');
  const unknown = unknownSafetyAnswers(p);

  const excluded: SelectionResult['excluded'] = [];
  type Candidate = { product: Product; skuId: string; pricePaise: number; role: RoutineRole };
  const candidates: Candidate[] = [];

  for (const product of [...input.products].sort((a, b) => a.id.localeCompare(b.id))) {
    const reasons = exclusions(product, input, unknown);
    if (reasons.length) {
      excluded.push({ productId: product.id, reasons });
      continue;
    }
    // Actual sellable SKUs: counted stock above zero and a positive price.
    const skus = input.variants
      .filter((v) => v.productId === product.id)
      .flatMap((v) => {
        const offer = input.offers[v.id];
        return offer && offer.stock !== null && offer.stock > 0 && Number.isInteger(offer.pricePaise) && offer.pricePaise > 0
          ? [{ skuId: v.id, pricePaise: offer.pricePaise }]
          : [];
      });
    if (skus.length === 0) {
      excluded.push({ productId: product.id, reasons: [r('unavailable', 'builtin:stock', 'Not in stock in any size.')] });
      continue;
    }
    // The cheapest available size: a routine buys one, the smallest outlay.
    const cheapest = [...skus].sort((a, b) => a.pricePaise - b.pricePaise || a.skuId.localeCompare(b.skuId))[0];
    candidates.push({ product, skuId: cheapest.skuId, pricePaise: cheapest.pricePaise, role: input.roles[product.id]! });
  }

  const ranked = (role: RoutineRole) => {
    const pool = candidates.filter((c) => c.role === role);
    const cheapestInRole = Math.min(...pool.map((c) => c.pricePaise));
    return pool
      .map((c) => ({ ...c, score: score(c.product, c.pricePaise, cheapestInRole, input, weights) }))
      .sort((a, b) => b.score - a.score || a.pricePaise - b.pricePaise || a.skuId.localeCompare(b.skuId));
  };

  let remaining = p.budgetPaise;
  const purchases: SelectionResult['purchases'] = [];
  const steps = { am: 0, pm: 0 };
  const buy = (c: { product: Product; skuId: string; pricePaise: number }, optional: boolean) => {
    remaining -= c.pricePaise;
    if (!purchases.some((x) => x.skuId === c.skuId)) {
      purchases.push({ skuId: c.skuId, productId: c.product.id, quantity: 1, pricePaise: c.pricePaise, optional });
    }
  };

  /* Essentials: the customer's own suitable products first. */
  const essentialSlots = new Map<EssentialRole, Slot>();
  const sessionsFor: Record<EssentialRole, ('am' | 'pm')[]> = { cleanse: ['am', 'pm'], moisturise: ['am', 'pm'], protect: ['am'] };
  for (const role of ESSENTIAL_ROLES) {
    const owned = [...p.ownedItems]
      .filter((o) => o.role === role && !o.prescribed)
      .sort((a, b) => a.id.localeCompare(b.id))
      .find((o) => !(p.allergyIngredientIds.length > 0 && o.ingredientIds.some((id) => p.allergyIngredientIds.includes(id))));
    if (owned) {
      const notes =
        owned.coverage === 'known'
          ? []
          : [r('owned_ingredients_unverified', 'builtin:owned', `We do not know everything in ${owned.label}; keep using it only if it suits you.`)];
      essentialSlots.set(role, { role, source: 'owned', ownedItemId: owned.id, label: owned.label, session: sessionsFor[role], notes });
      continue;
    }
    const pick = ranked(role).find((c) => c.pricePaise <= remaining);
    if (pick) {
      buy(pick, false);
      essentialSlots.set(role, {
        role,
        source: 'catalogue',
        productId: pick.product.id,
        skuId: pick.skuId,
        pricePaise: pick.pricePaise,
        score: pick.score,
        session: sessionsFor[role],
        reasons: [r('essential', 'builtin:essential-core', `Your ${role === 'protect' ? 'sunscreen' : role === 'cleanse' ? 'cleanser' : 'moisturiser'}.`)],
      });
    } else {
      const eligible = ranked(role);
      essentialSlots.set(role, {
        role,
        source: 'unfilled',
        reasons:
          eligible.length === 0
            ? [r('no_eligible_product', 'builtin:essential-core', 'No product we sell passes the checks for this step.')]
            : [r('over_budget', 'builtin:budget', `The least expensive suitable option costs more than your remaining budget.`)],
      });
    }
  }
  for (const s of essentialSlots.values()) if (s.source !== 'unfilled') for (const sess of s.session) steps[sess] += 1;
  const essentials = (['cleanse', 'moisturise', 'protect'] as EssentialRole[]).map((role) => essentialSlots.get(role)!);

  /* Treatments: eligible ones only, within the limit, budget and step cap. */
  const limit = Math.min(input.safety.maxTreatments ?? 1, 1); // one elective treatment at a time (spec section 16)
  const treatments: Slot[] = [];
  for (const c of ranked('treatment')) {
    if (treatments.length >= limit) break;
    const direction = input.knowledge.directions[c.product.id];
    const session: 'am' | 'pm' = direction?.session === 'am' ? 'am' : 'pm';
    if (c.pricePaise > remaining || steps[session] + 1 > p.maxDailySteps) continue;
    buy(c, false);
    steps[session] += 1;
    treatments.push({
      role: 'treatment',
      source: 'catalogue',
      productId: c.product.id,
      skuId: c.skuId,
      pricePaise: c.pricePaise,
      score: c.score,
      session: [session],
      reasons: [r('fits_priority', 'builtin:ranking', 'The best-matching eligible treatment for your priorities.')],
    });
  }
  if (treatments.length === 0) {
    treatments.push({
      role: 'treatment',
      source: 'unfilled',
      reasons: [r('no_eligible_treatment', 'builtin:treatment', 'No treatment can be recommended for you yet; see the reasons for each product.')],
    });
  }

  /* Optional additions: only with budget and steps left. */
  const optional: Slot[] = [];
  for (const c of ranked('optional')) {
    if (c.pricePaise > remaining || steps.pm + 1 > p.maxDailySteps) continue;
    if (p.priorities.length === 0 || !c.product.concerns.some((x) => p.priorities.includes(x))) continue;
    buy(c, true);
    steps.pm += 1;
    optional.push({
      role: 'optional',
      source: 'catalogue',
      productId: c.product.id,
      skuId: c.skuId,
      pricePaise: c.pricePaise,
      score: c.score,
      session: ['pm'],
      reasons: [r('optional_addition', 'builtin:optional', 'Optional; your routine is complete without it.')],
    });
    break; // at most one optional suggestion
  }

  const filled = essentials.filter((s) => s.source !== 'unfilled').length;
  return {
    status: filled === 3 ? 'complete' : filled === 0 ? 'no_match' : 'partial',
    essentials,
    treatments,
    optional,
    purchases,
    newSpendPaise: p.budgetPaise - remaining,
    budgetPaise: p.budgetPaise,
    excluded,
    unknownSafetyAnswers: unknown,
    weights,
  };
}
