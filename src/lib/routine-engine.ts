import type {
  SkinProfile,
  RecommendationResult,
  RoutineStep,
  RoutineLevel,
  ExperienceLevel,
  ReactivityLevel,
  RoutineMode,
  OmittedTreatment,
  TriState,
} from './routine-types';
import { SLOTS, SlotName, productForSlot, assertSlotsResolve } from './routine-slots';
import { getProductById } from './catalogue';
import { APPROVED_DIRECTIONS, TREATMENTS, type ProductDirections } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import {
  treatmentReadiness,
  type EvidenceSource,
  type Formulation,
  type Knowledge,
} from '@/modules/ingredients/formulations';

/**
 * AVYORA ROUTINE ENGINE
 *
 * Deterministic: the same answers always produce the same routine.
 *
 * The order of work is fixed, and it is the point of this module:
 *
 *   1. normalise answers (unknown stays unknown)
 *   2. decide the mode: recovery (irritated now), gentle (very reactive),
 *      otherwise essentials, upgraded to treatment if one survives step 3
 *   3. every treatment candidate passes every exclusion before anything is
 *      added: mode, beginner, pregnancy, age, approved directions, then the
 *      treatment limit
 *   4. build the essential sessions (cleanse, moisturise, protect), add the
 *      surviving treatments, list optional additions separately
 *   5. explanations and warnings are generated from what was actually chosen
 *      and omitted, so they cannot contradict the products
 *
 * It used to remove only the retinoid for irritated skin and keep vitamin C
 * and an exfoliant beside a "barrier repair only" message; it treated "prefer
 * not to say" as "not pregnant"; and it gave a beginner six steps a session.
 *
 * What it does not do: invent medical rules, concentrations or efficacy
 * claims. A treatment enters a routine only with approved, product-specific
 * directions (`src/data/product-directions.ts`), and none exist yet, so today
 * every routine is essentials plus clearly optional additions, and the result
 * says which treatments are waiting for reviewed directions.
 */

// Fail fast if a slot ever points at a SKU the catalogue no longer carries.
assertSlotsResolve();

/** Recorded on saved routines so a result can be traced to the rules that produced it. */
export const ROUTINE_ENGINE_VERSION = 'rules-2026-10-08';

/** Beginners get no more than this many steps in a morning or evening session. */
export const BEGINNER_SESSION_STEP_CAP = 3;

export type EngineOptions = {
  /** Approved directions by product id. Defaults to the reviewed registry. */
  directions?: Readonly<Record<string, ProductDirections>>;
  /** Verified formulations and evidence. Default to the reviewed registries. */
  formulations?: readonly Formulation[];
  evidence?: readonly EvidenceSource[];
};

type Candidate = { productId: string; session: 'am' | 'pm' };

export function getRecommendation(answers: any, options: EngineOptions = {}): RecommendationResult {
  const profile = normalizeAnswers(answers);
  const directions = options.directions ?? APPROVED_DIRECTIONS;
  const knowledge: Knowledge = {
    directions,
    formulations: options.formulations ?? FORMULATIONS,
    evidence: options.evidence ?? EVIDENCE_SOURCES,
  };

  const baseMode: RoutineMode | null =
    profile.currentCondition === 'irritated' ? 'recovery' : profile.reactivity === 'very_high' ? 'gentle' : null;
  const beginner = isBeginner(profile);

  /* ---- treatments: exclusions first, then the limit ---------------------- */
  const omitted: OmittedTreatment[] = [];
  const eligible: Candidate[] = [];
  for (const candidate of treatmentCandidates(profile)) {
    const reason = exclusion(profile, candidate.productId, baseMode, beginner, knowledge);
    if (reason) omitted.push({ productId: candidate.productId, reason });
    else eligible.push({ ...candidate, session: sessionFor(candidate, directions) });
  }

  const chosen: Candidate[] = [];
  const limit = treatmentLimit(profile);
  for (const c of eligible) {
    const sessionTaken = chosen.some((x) => x.session === c.session);
    if (chosen.length < limit && !sessionTaken) chosen.push(c);
    else omitted.push({ productId: c.productId, reason: 'treatment_limit' });
  }

  const mode: RoutineMode = baseMode ?? (chosen.length > 0 ? 'treatment' : 'essentials');

  /* ---- sessions ---------------------------------------------------------- */
  const morningRoutine = buildMorning(profile, mode, chosen, directions);
  const eveningRoutine = buildEvening(profile, mode, chosen, directions);
  const optionalSteps = buildOptional(profile, mode, beginner, chosen, knowledge, omitted);
  const bodyRoutine = buildBodyRoutine(profile);

  return {
    profile,
    mode,
    experienceLevelName: getExperienceName(profile.experienceLevel),
    morningTitle: 'Cleanse & Protect',
    eveningTitle: chosen.some((c) => c.session === 'pm') ? 'Cleanse, Treat & Moisturise' : 'Cleanse & Moisturise',
    morningRoutine,
    eveningRoutine,
    optionalSteps,
    bodyRoutine,
    underEyeGuidance: getUnderEyeGuidance(profile, mode),
    omitted,
    warnings: getWarnings(profile, mode, chosen, omitted),
    explanations: [],
    priorities: getPriorities(chosen),
    whyThisRoutine: generateWhyThisRoutine(profile, mode, beginner, chosen, omitted),
    recommendedProducts: mapProductSizes(morningRoutine, eveningRoutine, bodyRoutine, optionalSteps),
  };
}

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

function triState(value: unknown): TriState {
  // Anything but an explicit yes or no — "prefer not to say", a skipped
  // question, an old saved answer — is unknown, and unknown never establishes
  // eligibility for a restricted treatment.
  return value === 'yes' || value === 'no' ? value : 'unknown';
}

export function normalizeAnswers(a: any): SkinProfile {
  const expMap: Record<string, ExperienceLevel> = {
    none: 'N0',
    beginner: 'N1',
    basic: 'N2',
    regular: 'N3',
    experienced: 'N4',
  };
  const exp = expMap[a.experience] || 'N0';
  const levelMap: Record<ExperienceLevel, RoutineLevel> = { N0: 4, N1: 5, N2: 6, N3: 7, N4: 7 };
  const reactMap: Record<string, ReactivityLevel> = {
    rarely: 'low',
    sometimes: 'medium',
    easily: 'high',
    very_high: 'very_high',
  };

  return {
    primaryConcern: a.concern,
    secondaryConcerns: a.secondaryConcerns || [],
    skinType: a.skinType,
    // An unanswered reactivity question is not evidence of tolerant skin.
    reactivity: reactMap[a.reactivity] || 'high',
    ageRange: a.age,
    sunExposure: a.sun,
    experienceLevel: exp,
    routineLevel: levelMap[exp],
    consistency: a.consistency,
    currentCondition: a.currentCondition,
    darkCircles: a.darkCircles || 'no',
    darkSpots: a.darkSpots || 'no',
    bodyCare: a.bodyCare === 'yes',
    pregnancy: triState(a.pregnancy),
  };
}

function isBeginner(p: SkinProfile): boolean {
  return p.experienceLevel === 'N0' || p.experienceLevel === 'N1';
}

function matchesConcern(p: SkinProfile, needles: string[]): boolean {
  const haystack = [p.primaryConcern, ...p.secondaryConcerns].filter(Boolean).map((c) => String(c).toLowerCase());
  return haystack.some((c) => needles.some((n) => c.includes(n)));
}

/* -------------------------------------------------------------------------- */
/* Treatments                                                                  */
/* -------------------------------------------------------------------------- */

/** Treatments that match what the customer asked about, in priority order. */
function treatmentCandidates(p: SkinProfile): Candidate[] {
  const out: Candidate[] = [];
  if (matchesConcern(p, ['aging', 'fine line', 'texture', 'rough']))
    out.push({ productId: SLOTS.retinol, session: 'pm' });
  if (matchesConcern(p, ['dark spot', 'pigment', 'dull', 'uneven', 'tanning'])) {
    out.push({ productId: SLOTS.vitaminC, session: 'am' });
  }
  if (matchesConcern(p, ['acne', 'breakout', 'oil', 'pore'])) out.push({ productId: SLOTS.niacinamide, session: 'am' });
  return out;
}

/**
 * The first reason this treatment cannot be recommended, or null.
 *
 * Order matters only for which reason is reported; any one is enough to
 * exclude. The safety reasons come before "directions pending" so a customer
 * learns the reason that will still apply once directions are approved.
 */
function exclusion(
  p: SkinProfile,
  productId: string,
  baseMode: RoutineMode | null,
  beginner: boolean,
  knowledge: Knowledge
): OmittedTreatment['reason'] | null {
  const treatment = TREATMENTS[productId];
  if (baseMode === 'recovery') return 'irritated';
  if (baseMode === 'gentle') return 'very_reactive';
  if (beginner) return 'beginner';
  if (treatment?.class === 'retinoid') {
    if (p.pregnancy === 'yes') return 'pregnancy_yes';
    if (p.pregnancy === 'unknown') return 'pregnancy_unknown';
    if (p.ageRange === 'under18') return 'under18';
  }
  // Approved directions for a specific, complete, verified formulation.
  // Missing formulation data blocks the treatment; it is never assumed fine.
  if (!treatment) return knowledge.directions[productId] ? null : 'directions_pending';
  const readiness = treatmentReadiness(productId, treatment.class, knowledge);
  return readiness.ready ? null : readiness.reason;
}

/** One active at a time for less experienced or reactive skin; two otherwise, one per session. */
function treatmentLimit(p: SkinProfile): number {
  if (p.experienceLevel === 'N2' || p.reactivity === 'high') return 1;
  return 2;
}

function sessionFor(c: Candidate, directions: Readonly<Record<string, ProductDirections>>): 'am' | 'pm' {
  const session = directions[c.productId]?.session;
  return session === 'am' || session === 'pm' ? session : c.session;
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

/** A step from a catalogue slot; name and size come from the catalogue. */
function slotStep(
  category: RoutineStep['category'],
  slotName: string,
  slot: SlotName,
  explanation: string,
  extra: Partial<RoutineStep> = {}
): RoutineStep {
  const product = productForSlot(slot);
  return {
    order: 0,
    category,
    label: slotName.toUpperCase(),
    slotName,
    productId: SLOTS[slot],
    productName: product?.name,
    productSize: product?.sizes[0]?.label,
    explanation,
    isAvyoraProduct: true,
    ...extra,
  };
}

function treatmentStep(c: Candidate, directions: Readonly<Record<string, ProductDirections>>): RoutineStep {
  const product = getProductById(c.productId);
  const approved = directions[c.productId];
  const category: RoutineStep['category'] =
    TREATMENTS[c.productId]?.class === 'retinoid'
      ? 'renew'
      : TREATMENTS[c.productId]?.class === 'vitamin_c'
        ? 'brighten'
        : 'treatment';
  return {
    order: 0,
    category,
    label: 'TREAT',
    slotName: 'Treat',
    productId: c.productId,
    productName: product?.name,
    productSize: product?.sizes[0]?.label,
    // Only approved, product-specific directions — never a generic schedule.
    frequency: approved.frequency,
    explanation: approved.text,
    isAvyoraProduct: true,
  };
}

function numbered(steps: RoutineStep[]): RoutineStep[] {
  return steps.map((s, i) => ({ ...s, order: i + 1 }));
}

/**
 * A cleanser for the mode. The default gel cleanser lists LHA, an exfoliating
 * acid, among its highlights, so recovery, very reactive and sensitive skin
 * get the centella balm the catalogue tags for sensitivity and redness.
 */
function cleanser(p: SkinProfile, mode: RoutineMode): SlotName {
  return mode === 'recovery' || mode === 'gentle' || p.skinType === 'sensitive' ? 'cleansingBalm' : 'gelCleanser';
}

function moisturiser(p: SkinProfile, mode: RoutineMode): SlotName {
  if (mode === 'recovery' || mode === 'gentle') return 'moisturizerRich';
  return p.skinType === 'oily' ? 'moisturizerLight' : 'moisturizerRich';
}

function buildMorning(
  p: SkinProfile,
  mode: RoutineMode,
  chosen: Candidate[],
  directions: Readonly<Record<string, ProductDirections>>
): RoutineStep[] {
  const steps = [
    slotStep('cleanse', 'Cleanse', cleanser(p, mode), 'Cleanse your face and pat it dry.'),
    ...chosen.filter((c) => c.session === 'am').map((c) => treatmentStep(c, directions)),
    slotStep('hydrate', 'Moisturise', moisturiser(p, mode), 'A moisturiser chosen for your skin type.'),
    slotStep('protect', 'Protect', 'sunscreen', 'Sunscreen, as the last step of the morning.'),
  ];
  return numbered(steps);
}

function buildEvening(
  p: SkinProfile,
  mode: RoutineMode,
  chosen: Candidate[],
  directions: Readonly<Record<string, ProductDirections>>
): RoutineStep[] {
  const steps = [
    slotStep('cleanse', 'Cleanse', cleanser(p, mode), 'Cleanse away the day, including sunscreen.'),
    ...chosen.filter((c) => c.session === 'pm').map((c) => treatmentStep(c, directions)),
    slotStep('hydrate', 'Moisturise', moisturiser(p, mode), 'A moisturiser chosen for your skin type.'),
  ];
  return numbered(steps);
}

/**
 * Additions the customer may choose. Never part of the essential routine,
 * never counted against a session's step cap, and none in recovery or gentle
 * modes, where the point is to keep the routine as small as possible.
 *
 * Exfoliation is an optional addition only when it passes the same
 * exclusions as any treatment; otherwise it is reported as omitted.
 */
function buildOptional(
  p: SkinProfile,
  mode: RoutineMode,
  beginner: boolean,
  chosen: Candidate[],
  knowledge: Knowledge,
  omitted: OmittedTreatment[]
): RoutineStep[] {
  if (mode === 'recovery' || mode === 'gentle') return [];
  const optional: RoutineStep[] = [];
  const opt = { optional: true };

  if (p.skinType === 'dry' || matchesConcern(p, ['dry'])) {
    optional.push(
      slotStep(
        'tone',
        'Toner (optional)',
        p.skinType === 'dry' ? 'tonerRich' : 'tonerHydrating',
        'Optional. A hydrating toner after cleansing, if your skin feels tight.',
        opt
      )
    );
  }

  if (!beginner && matchesConcern(p, ['dull', 'uneven', 'glow'])) {
    optional.push(
      slotStep(
        'essence',
        'Essence (optional)',
        'essenceBrightening',
        'Optional. A light layer before moisturiser.',
        opt
      )
    );
  }

  if (p.darkCircles !== 'no') {
    optional.push(slotStep('eye', 'Eye patches (optional)', 'eyePatches', 'Optional, for the under-eye area.', opt));
  }

  if (matchesConcern(p, ['texture', 'rough', 'acne', 'breakout'])) {
    const exfoliant = SLOTS[p.skinType === 'oily' ? 'exfoliantOily' : 'exfoliantGentle'];
    const retinoidInPlan = chosen.some((c) => TREATMENTS[c.productId]?.class === 'retinoid');
    const reason =
      exclusion(p, exfoliant, null, beginner, knowledge) ??
      // Never offered beside a retinoid until the planner can schedule them
      // on separate days; prose saying "alternate" is not a schedule.
      (retinoidInPlan || p.reactivity === 'high' ? 'treatment_limit' : null);
    if (reason) {
      omitted.push({ productId: exfoliant, reason });
    } else {
      const approved = knowledge.directions[exfoliant];
      const product = getProductById(exfoliant);
      optional.push({
        order: 0,
        category: 'exfoliate',
        label: 'EXFOLIATE',
        slotName: 'Exfoliate (optional)',
        productId: exfoliant,
        productName: product?.name,
        productSize: product?.sizes[0]?.label,
        frequency: approved.frequency,
        explanation: approved.text,
        isAvyoraProduct: true,
        optional: true,
      });
    }
  }

  return numbered(optional);
}

function buildBodyRoutine(p: SkinProfile): RoutineStep[] {
  if (!p.bodyCare) return [];
  return numbered([slotStep('body', 'Body care', 'bodyLotion', 'Body moisturiser, after bathing.')]);
}

/** De-duplicated purchase list; an essential occurrence wins over an optional one. */
function mapProductSizes(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[], optional: RoutineStep[]) {
  const unique = new Map<string, { size: string; optional: boolean }>();
  for (const s of [...am, ...pm, ...body, ...optional]) {
    if (s.isAvyoraProduct && s.productId && !unique.has(s.productId)) {
      unique.set(s.productId, { size: s.productSize ?? '', optional: Boolean(s.optional) });
    }
  }
  return [...unique.entries()].map(([productId, v]) => ({ productId, size: v.size, optional: v.optional }));
}

/* -------------------------------------------------------------------------- */
/* Copy — generated from the decisions above, never independently             */
/* -------------------------------------------------------------------------- */

function getExperienceName(exp: ExperienceLevel) {
  const map = { N0: 'MINIMAL', N1: 'BEGINNER', N2: 'REGULAR', N3: 'SERIOUS', N4: 'ADVANCED' };
  return map[exp] || 'PERSONAL';
}

function getUnderEyeGuidance(p: SkinProfile, mode: RoutineMode) {
  if (p.darkCircles === 'no') return undefined;
  if (mode === 'recovery' || mode === 'gentle') {
    return 'You mentioned dark circles. We have kept this routine to the essentials for now, so eye products are not included.';
  }
  return 'You mentioned dark circles, so eye patches are listed as an optional addition. Dark circles are often structural or genetic, and no topical product can be promised to remove them.';
}

const NAMES = (ids: string[]) => ids.map((id) => getProductById(id)?.name ?? id).join(', ');

function getWarnings(p: SkinProfile, mode: RoutineMode, chosen: Candidate[], omitted: OmittedTreatment[]) {
  const w: string[] = [];
  const has = (reason: OmittedTreatment['reason']) => omitted.some((o) => o.reason === reason);

  w.push('Patch test any new product on your inner forearm for a few days before applying it to your face.');

  if (p.reactivity === 'high' || p.reactivity === 'very_high') {
    w.push('Your skin is reactive, so introduce one new product at a time.');
  }
  if (mode === 'recovery') {
    w.push(
      'Your skin is irritated right now, so this routine has no actives or exfoliation: only cleansing, moisturiser and sunscreen. If irritation persists or is painful, see a dermatologist.'
    );
  }
  if (mode === 'gentle') {
    w.push('Because your skin is very reactive, this routine has no actives or exfoliation.');
  }
  if (has('pregnancy_yes')) {
    w.push(
      'You told us you are pregnant or breastfeeding, so retinoids are left out. Check any new product with your doctor or midwife.'
    );
  }
  if (has('pregnancy_unknown')) {
    w.push(
      'You preferred not to say whether you are pregnant or breastfeeding, so retinoids are left out of this routine.'
    );
  }
  if (has('under18')) {
    w.push('Retinoids are left out for customers under 18.');
  }
  if (chosen.some((c) => TREATMENTS[c.productId]?.class === 'retinoid')) {
    w.push('Use daily sunscreen while using a retinoid, and follow its directions exactly.');
  }

  w.push(
    'This is general guidance, not medical advice. Persistent or painful skin conditions deserve a dermatologist.'
  );
  return w;
}

function getPriorities(chosen: Candidate[]) {
  const prio = ['01 — CLEANSE', '02 — MOISTURISE', '03 — PROTECT'];
  if (chosen.length > 0) prio.push(`04 — TREAT: ${NAMES(chosen.map((c) => c.productId)).toUpperCase()}`);
  return prio;
}

function generateWhyThisRoutine(
  p: SkinProfile,
  mode: RoutineMode,
  beginner: boolean,
  chosen: Candidate[],
  omitted: OmittedTreatment[]
) {
  const concern = String(p.primaryConcern || 'your concern').toLowerCase();
  const parts = [`You told us ${concern} matters most and that your skin is ${p.skinType}.`];

  if (mode === 'recovery') {
    parts.push(
      'Your skin is irritated right now, so this routine is cleanse, moisturise and protect, with no actives or exfoliation. Reintroduce treatments one at a time once it has settled.'
    );
  } else if (mode === 'gentle') {
    parts.push(
      'Your skin is very reactive, so the routine keeps to cleansing, moisturiser and sunscreen, with no actives or exfoliation.'
    );
  } else if (beginner) {
    parts.push(
      `A simple routine to start: cleanse, moisturise and sunscreen, never more than ${BEGINNER_SESSION_STEP_CAP} steps at a time. Any optional additions are listed separately; add them only if you want to.`
    );
  } else if (chosen.length > 0) {
    parts.push(
      `The essentials, plus ${NAMES(chosen.map((c) => c.productId))}, used exactly as its directions describe.`
    );
  } else {
    parts.push('This routine covers the essentials: cleanse, moisturise and protect.');
  }

  if (omitted.some((o) => o.reason === 'directions_pending')) {
    parts.push(
      'Some treatments that match your concern are not included yet, because their usage directions are still being reviewed.'
    );
  }
  if (omitted.some((o) => o.reason === 'formulation_incomplete')) {
    parts.push(
      'Some treatments that match your concern are not included yet, because their full formulation has not been verified.'
    );
  }

  parts.push('Consistency matters more than the number of steps. Stop anything that stings or burns.');
  return parts.join(' ');
}
