import {
  SkinProfile,
  RecommendationResult,
  RoutineStep,
  RoutineLevel,
  ExperienceLevel,
  ReactivityLevel,
} from './routine-types';
import { SLOTS, SlotName, productForSlot, assertSlotsResolve } from './routine-slots';

/**
 * AVYORA ROUTINE ENGINE
 *
 * Deterministic: the same answers always produce the same routine, so a
 * customer can revisit their result and see the same thing.
 *
 * The recommendation rules follow mainstream dermatological guidance:
 *
 *  - Vitamin C goes on clean skin early in the morning routine, before the
 *    hydrating essence layers, then sits under sunscreen.
 *  - Retinoids are evening-only and are never scheduled on the same night as
 *    a chemical exfoliant; stacking the two is the most common cause of a
 *    damaged barrier. The two are alternated instead.
 *  - Retinoids are withheld entirely during pregnancy and breastfeeding, under
 *    18, and while skin is actively irritated.
 *  - Retinoid frequency ramps up slowly from one or two nights a week, with
 *    moisturiser buffering offered to reactive skin.
 *
 * Sources are listed in docs/routine-methodology.md.
 */

// Fail fast if a slot ever points at a SKU the catalogue no longer carries.
assertSlotsResolve();

export function getRecommendation(answers: any): RecommendationResult {
  const profile = normalizeAnswers(answers);

  const retinoidBlocked = retinoidExclusion(profile);
  const vitCEligible = checkVitCEligibility(profile);
  const retinolEligible = !retinoidBlocked && checkRetinolQualifying(profile);

  const { recommendVitaminC, recommendRetinol } = selectActives(profile, vitCEligible, retinolEligible);

  const vitCFreq = getVitCFrequency(profile, recommendVitaminC);
  const retinolFreq = getRetinolFrequency(profile, recommendRetinol);

  // Exfoliation and retinoid nights must not collide.
  const exfoliationFreq = getExfoliationFrequency(profile, recommendRetinol);

  const morningRoutine = buildMorning(profile, recommendVitaminC, vitCFreq);
  const eveningRoutine = buildEvening(profile, recommendRetinol, retinolFreq, exfoliationFreq);
  const bodyRoutine = buildBodyRoutine(profile);

  const recommendedProducts = mapProductSizes(morningRoutine, eveningRoutine, bodyRoutine);

  return {
    profile,
    experienceLevelName: getExperienceName(profile.experienceLevel),
    morningTitle: getMorningTitle(profile),
    eveningTitle: getEveningTitle(profile),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    underEyeGuidance: getUnderEyeGuidance(profile),
    warnings: getWarnings(profile, recommendRetinol, retinoidBlocked),
    explanations: [],
    priorities: getPriorities(profile),
    whyThisRoutine: generateWhyThisRoutine(profile, recommendVitaminC, recommendRetinol, retinoidBlocked),
    recommendedProducts,
    treatmentSchedule: {
      retinol: recommendRetinol ? getRetinolSchedule(profile) : undefined,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Step construction                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Builds a step from a slot, pulling the display name and default size from
 * the catalogue so the two can never drift out of sync.
 */
function step(
  order: number,
  category: RoutineStep['category'],
  label: string,
  slotName: string,
  slot: SlotName,
  explanation: string,
  frequency?: string
): RoutineStep {
  const product = productForSlot(slot);
  return {
    order,
    category,
    label,
    slotName,
    productId: SLOTS[slot],
    productName: product?.name,
    productSize: product?.sizes[0]?.label,
    frequency,
    explanation,
    isAvyoraProduct: true,
  };
}

function normalizeAnswers(a: any): SkinProfile {
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
    reactivity: reactMap[a.reactivity] || 'low',
    ageRange: a.age,
    sunExposure: a.sun,
    experienceLevel: exp,
    routineLevel: levelMap[exp],
    consistency: a.consistency,
    currentCondition: a.currentCondition,
    darkCircles: a.darkCircles || 'no',
    darkSpots: a.darkSpots || 'no',
    bodyCare: a.bodyCare === 'yes',
    pregnancy: a.pregnancy === 'yes',
  };
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

function matchesConcern(p: SkinProfile, needles: string[]): boolean {
  const haystack = [p.primaryConcern, ...p.secondaryConcerns]
    .filter(Boolean)
    .map((c) => String(c).toLowerCase());
  return haystack.some((c) => needles.some((n) => c.includes(n)));
}

function checkVitCEligibility(p: SkinProfile): boolean {
  return matchesConcern(p, ['dark spot', 'pigment', 'dull', 'uneven', 'tanning']);
}

function checkRetinolQualifying(p: SkinProfile): boolean {
  return matchesConcern(p, ['aging', 'fine line', 'texture', 'rough', 'dark spot', 'pigment']);
}

/** Returns the reason retinoids are withheld, or null when they are allowed. */
function retinoidExclusion(p: SkinProfile): string | null {
  if (p.pregnancy) return 'pregnancy';
  if (p.ageRange === 'under18') return 'under18';
  if (p.reactivity === 'very_high') return 'reactivity';
  if (p.currentCondition === 'irritated') return 'irritated';
  if (p.routineLevel === 4) return 'newToRoutine';
  return null;
}

function selectActives(p: SkinProfile, vitC: boolean, retinol: boolean) {
  if (p.routineLevel === 4) return { recommendVitaminC: false, recommendRetinol: false };

  // At level 5 the routine carries a single active so the skin has one
  // variable to adapt to at a time.
  if (p.routineLevel === 5 && vitC && retinol) {
    const agingLed = matchesConcern(p, ['aging', 'fine line', 'texture']);
    return { recommendVitaminC: !agingLed, recommendRetinol: agingLed };
  }

  return { recommendVitaminC: vitC, recommendRetinol: retinol };
}

function getVitCFrequency(p: SkinProfile, rec: boolean) {
  if (!rec) return '';
  if (p.routineLevel === 5) return '2–3 mornings a week';
  if (p.routineLevel === 6) return '3–5 mornings a week';
  return 'Every morning, as tolerated';
}

function getRetinolFrequency(p: SkinProfile, rec: boolean) {
  if (!rec) return '';
  if (p.reactivity === 'high') return '1 night a week to start';
  if (p.routineLevel === 5) return '1 night a week to start';
  if (p.routineLevel === 6) return '2 nights a week, building to 3';
  return '3 nights a week, building to 5 as tolerated';
}

/**
 * Exfoliation is scheduled around the retinoid rather than alongside it.
 * Using both on one night is the most reliable way to compromise the barrier.
 */
function getExfoliationFrequency(p: SkinProfile, retinol: boolean) {
  if (p.reactivity === 'very_high') return 'Once a week at most, on a night you skip other actives';
  if (retinol) return '1–2 nights a week, never on a retinol night';
  if (p.reactivity === 'high') return '1 night a week';
  return '2–3 nights a week';
}

/* -------------------------------------------------------------------------- */
/* Routines                                                                    */
/* -------------------------------------------------------------------------- */

function buildMorning(p: SkinProfile, vitC: boolean, freq: string): RoutineStep[] {
  const isDry = p.skinType === 'dry';
  const isOily = p.skinType === 'oily';
  const steps: RoutineStep[] = [];
  let n = 1;

  steps.push(
    step(n++, 'cleanse', `0${n - 1} — CLEANSE`, 'Cleanse', 'gelCleanser',
      'A low-pH gel cleanser removes overnight oil without stripping the barrier.')
  );

  steps.push(
    step(n++, 'tone', `0${n - 1} — TONE`, 'Tone', isDry ? 'tonerRich' : 'tonerHydrating',
      'A hydrating toner rebalances the skin and preps it to absorb what follows.')
  );

  // Vitamin C goes on clean, barely-damp skin before the heavier hydrating
  // layers, so nothing blocks its penetration.
  if (vitC) {
    steps.push(
      step(n++, 'brighten', `0${n - 1} — TREAT`, 'Treat', 'vitaminC',
        'Vitamin C sits directly on cleansed skin to target pigmentation and buffer daily oxidative stress. It works alongside your sunscreen, not instead of it.',
        freq)
    );
  } else {
    steps.push(
      step(n++, 'treatment', `0${n - 1} — TREAT`, 'Treat', 'niacinamide',
        'Niacinamide is well tolerated alongside almost everything, regulating oil and calming redness.')
    );
  }

  steps.push(
    step(n++, 'essence', `0${n - 1} — ESSENCE`, 'Essence', 'essenceBrightening',
      'A light ferment essence layers hydration over the treatment step.')
  );

  if (p.darkCircles !== 'no') {
    steps.push(
      step(n++, 'eye', `0${n - 1} — EYE CARE`, 'Eye Care', 'eyePatches',
        'Caffeine and peptides help de-puff and soften fine lines around the eye.')
    );
  }

  steps.push(
    step(n++, 'hydrate', `0${n - 1} — MOISTURISE`, 'Moisturise',
      isOily ? 'moisturizerLight' : 'moisturizerRich',
      'Seal the preceding layers with a texture suited to your skin type.')
  );

  steps.push(
    step(n++, 'protect', `0${n - 1} — PROTECT`, 'Protect', 'sunscreen',
      'SPF is the final morning step and the single highest-impact one. Reapply every two hours outdoors.')
  );

  return steps;
}

function buildEvening(
  p: SkinProfile,
  retinol: boolean,
  retinolFreq: string,
  exfoliationFreq: string
): RoutineStep[] {
  const isDry = p.skinType === 'dry';
  const isOily = p.skinType === 'oily';
  const steps: RoutineStep[] = [];
  let n = 1;

  steps.push(
    step(n++, 'cleanse', `0${n - 1} — FIRST CLEANSE`, 'First Cleanse', 'cleansingOil',
      'An oil cleanse dissolves sunscreen and sebum, which water alone cannot shift.')
  );

  steps.push(
    step(n++, 'cleanse', `0${n - 1} — SECOND CLEANSE`, 'Second Cleanse', 'gelCleanser',
      'The water-based follow-up clears what the oil left behind.')
  );

  steps.push(
    step(n++, 'exfoliate', `0${n - 1} — EXFOLIATE`, 'Exfoliate',
      isOily ? 'exfoliantOily' : 'exfoliantGentle',
      retinol
        ? 'Use on the nights you are not applying retinol. Combining acids and a retinoid in one session is the fastest route to a compromised barrier.'
        : 'Chemical exfoliation keeps texture smooth. Build up slowly and stop if skin feels tight.',
      exfoliationFreq)
  );

  steps.push(
    step(n++, 'tone', `0${n - 1} — TONE`, 'Tone', isDry ? 'tonerRich' : 'tonerHydrating',
      'Restore hydration after cleansing and prepare skin for the treatment step.')
  );

  if (retinol) {
    steps.push(
      step(n++, 'renew', `0${n - 1} — TREAT`, 'Treat', 'retinol',
        'Retinol drives cell turnover and collagen synthesis. Apply to completely dry skin, start at the frequency shown, and increase only once there is no flaking.',
        retinolFreq)
    );
  } else {
    steps.push(
      step(n++, 'treatment', `0${n - 1} — TREAT`, 'Treat',
        p.reactivity === 'very_high' || p.skinType === 'sensitive' ? 'essenceSoothing' : 'essenceRepair',
        'A repairing treatment supports the barrier overnight, when the skin does most of its recovery.')
    );
  }

  if (p.darkCircles !== 'no') {
    steps.push(
      step(n++, 'eye', `0${n - 1} — EYE CARE`, 'Eye Care', 'eyePatches',
        'Optional overnight hydration for the eye area.')
    );
  }

  steps.push(
    step(n++, 'hydrate', `0${n - 1} — MOISTURISE`, 'Moisturise', 'moisturizerRich',
      retinol
        ? 'Apply generously after retinol. If your skin stings, you can also apply moisturiser before the retinol to buffer it.'
        : 'An occlusive final layer limits water loss overnight.')
  );

  return steps;
}

function buildBodyRoutine(p: SkinProfile): RoutineStep[] {
  if (!p.bodyCare) return [];
  return [
    step(1, 'body', 'BODY CARE', 'Body care', 'bodyLotion',
      'Apply to damp skin straight after bathing, while the surface still holds water.'),
  ];
}

/** Collapses the routines into a de-duplicated purchase list. */
function mapProductSizes(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[]) {
  const unique = new Map<string, string>();
  [...am, ...pm, ...body].forEach((s) => {
    if (s.isAvyoraProduct && s.productId && !unique.has(s.productId)) {
      unique.set(s.productId, s.productSize ?? '');
    }
  });
  return Array.from(unique.entries()).map(([productId, size]) => ({ productId, size }));
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

function getExperienceName(exp: ExperienceLevel) {
  const map = { N0: 'MINIMAL', N1: 'BEGINNER', N2: 'REGULAR', N3: 'SERIOUS', N4: 'ADVANCED' };
  return map[exp] || 'PERSONAL';
}

function getMorningTitle(p: SkinProfile) {
  if (matchesConcern(p, ['dull', 'uneven', 'tanning'])) return 'Brighten & Protect';
  return 'Protect & Prep';
}

function getEveningTitle(p: SkinProfile) {
  if (matchesConcern(p, ['aging', 'fine line'])) return 'Renew & Repair';
  return 'Recover & Hydrate';
}

function getUnderEyeGuidance(p: SkinProfile) {
  if (p.darkCircles === 'no') return undefined;
  return 'You flagged an under-eye concern, so we have added our caffeine and peptide patches. Note that dark circles are often structural or genetic, and topical products soften rather than remove them.';
}

function getWarnings(p: SkinProfile, retinol: boolean, blockedReason: string | null) {
  const w: string[] = [];

  w.push('Patch test any new product on your inner forearm for a few days before applying it to your face.');

  if (p.reactivity === 'high' || p.reactivity === 'very_high') {
    w.push('Your skin is reactive, so introduce one new product at a time and leave about two weeks between additions.');
  }

  if (retinol) {
    w.push('Retinol increases sun sensitivity. Daily SPF is not optional while you use it.');
    w.push('Do not use retinol on the same night as your exfoliant.');
    w.push('A short adjustment period with dryness or small breakouts is common in the first two to six weeks. Persistent burning or swelling is not, and means you should stop.');
  }

  if (blockedReason === 'pregnancy') {
    w.push('You told us you are pregnant or breastfeeding, so we have left retinoids out entirely. Vitamin C, niacinamide and azelaic acid are the usual alternatives, but confirm anything new with your doctor or midwife.');
  }
  if (blockedReason === 'irritated') {
    w.push('Your skin is irritated right now. This routine keeps to barrier repair only; reintroduce actives once it has settled.');
  }
  if (blockedReason === 'under18') {
    w.push('We do not recommend retinoids under 18. Consistent cleansing, moisturiser and SPF do most of the work at this stage.');
  }

  w.push('This is general guidance, not medical advice. Persistent or painful skin conditions deserve a dermatologist.');

  return w;
}

function getPriorities(p: SkinProfile) {
  const prio: string[] = [];
  if (matchesConcern(p, ['acne', 'breakout'])) prio.push('01 — CLEARING PORES');
  else prio.push('01 — BARRIER HEALTH');
  prio.push('02 — CELLULAR REPAIR');
  prio.push('03 — UV DEFENCE');
  return prio;
}

function generateWhyThisRoutine(
  p: SkinProfile,
  vitC: boolean,
  retinol: boolean,
  blockedReason: string | null
) {
  const concern = String(p.primaryConcern || 'your concern').toLowerCase();
  const parts = [
    `You told us ${concern} matters most and that your skin is ${p.skinType}.`,
  ];

  if (vitC && retinol) {
    parts.push('We split your actives across the day: vitamin C in the morning under sunscreen, retinol at night. That keeps them from irritating each other and suits how each one works.');
  } else if (vitC) {
    parts.push('Vitamin C sits in your morning routine, where it pairs naturally with sunscreen.');
  } else if (retinol) {
    parts.push('Retinol sits in your evening routine, introduced slowly so your skin can adapt.');
  } else if (blockedReason) {
    parts.push('We have kept strong actives out of this routine for now and focused on cleansing, hydration and daily SPF, which is where most visible improvement comes from anyway.');
  }

  parts.push('Consistency matters more than the number of steps. Skip anything that stings.');
  return parts.join(' ');
}

function getRetinolSchedule(p: SkinProfile) {
  if (p.reactivity === 'high') {
    return 'Weeks 1–4: one night a week. Weeks 5–8: two nights. Increase only if there is no flaking or stinging.';
  }
  return 'Weeks 1–2: one night a week. Weeks 3–4: two nights. Week 5 onward: increase gradually to your target frequency.';
}
