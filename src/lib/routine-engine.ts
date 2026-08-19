import { SkinProfile, RecommendationResult, RoutineStep, RoutineLevel, ExperienceLevel, ReactivityLevel } from './routine-types';

/**
 * STRICT RULE-BASED MODE: 7-Step AM / 7-Step PM fixed architecture.
 */

export function getRecommendation(answers: any): RecommendationResult {
  const profile = normalizeAnswers(answers);
  
  // 1. Evaluations
  const retinolExclusions = checkRetinolExclusions(profile);
  const vitCEligible = checkVitCEligibility(profile);
  const retinolEligible = !retinolExclusions && checkRetinolQualifying(profile);
  
  // 2. Active Selection (Table 3 & Table 8)
  const { recommendVitaminC, recommendRetinol } = selectActives(profile, vitCEligible, retinolEligible);

  // 3. Frequencies
  const vitCFreq = getVitCFrequency(profile, recommendVitaminC);
  const retinolFreq = getRetinolFrequency(profile, recommendRetinol);

  // 4. Routine Construction (Fixed 7+7)
  const morningRoutine = buildFixedMorningRoutine(profile, recommendVitaminC, vitCFreq);
  const eveningRoutine = buildFixedEveningRoutine(profile, recommendRetinol, retinolFreq);
  const bodyRoutine = buildBodyRoutine(profile);

  // 5. Size Mapping
  const recommendedProducts = mapProductSizes(morningRoutine, eveningRoutine, bodyRoutine, profile);

  return {
    profile,
    experienceLevelName: getExperienceName(profile.experienceLevel),
    morningTitle: getMorningTitle(profile, recommendVitaminC, recommendRetinol),
    eveningTitle: getEveningTitle(profile, recommendRetinol),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    underEyeGuidance: getUnderEyeGuidance(profile),
    warnings: getWarnings(profile, recommendRetinol),
    explanations: getExplanations(profile, recommendVitaminC, recommendRetinol),
    priorities: getPriorities(profile),
    whyThisRoutine: generateWhyThisRoutine(profile, recommendVitaminC, recommendRetinol),
    recommendedProducts,
    treatmentSchedule: {
      retinol: recommendRetinol ? getRetinolSchedule(profile) : undefined,
    }
  };
}

function normalizeAnswers(a: any): SkinProfile {
  const expMap: Record<string, ExperienceLevel> = {
    'none': 'N0',
    'beginner': 'N1',
    'basic': 'N2',
    'regular': 'N2',
    'experienced': 'N4'
  };
  const exp = expMap[a.experience] || 'N0';
  
  const levelMap: Record<ExperienceLevel, RoutineLevel> = {
    'N0': 4,
    'N1': 5,
    'N2': 6,
    'N3': 7,
    'N4': 7
  };

  const reactMap: Record<string, ReactivityLevel> = {
    'rarely': 'low',
    'sometimes': 'medium',
    'easily': 'high',
    'very_high': 'very_high'
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
  };
}

function checkVitCEligibility(p: SkinProfile): boolean {
  if (p.reactivity === 'very_high') return false;
  const qualifying = ['Dark Spots & Pigmentation', 'Dullness & Uneven Tone', 'Tanning', 'dark-spots', 'dullness', 'uneven', 'tanning'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function checkRetinolExclusions(p: SkinProfile): boolean {
  if (p.ageRange === 'under18') return true;
  if (p.reactivity === 'very_high') return true;
  if (p.currentCondition === 'irritated') return true;
  if (p.routineLevel === 4) return true;
  return false;
}

function checkRetinolQualifying(p: SkinProfile): boolean {
  const qualifying = ['Fine Lines & Aging', 'Texture & Roughness', 'Dark Spots & Pigmentation', 'aging', 'lines', 'texture', 'dark-spots'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function selectActives(p: SkinProfile, vitC: boolean, retinol: boolean) {
  const res = { recommendVitaminC: false, recommendRetinol: false };

  if (p.routineLevel === 4) return res;

  if (p.routineLevel === 5) {
    if (vitC && retinol) {
      // Pick based on Priority (Table 9)
      const vitCPrio = getPriority(p.primaryConcern, 'vitamin-c');
      const retPrio = getPriority(p.primaryConcern, 'retinol');
      if (vitCPrio >= retPrio) res.recommendVitaminC = true;
      else res.recommendRetinol = true;
    } else {
      res.recommendVitaminC = vitC;
      res.recommendRetinol = retinol;
    }
    return res;
  }

  res.recommendVitaminC = vitC;
  res.recommendRetinol = retinol;
  return res;
}

function getPriority(concern: string, active: string): number {
  const priorities = [
    'Acne & Breakouts',
    'Dark Spots & Pigmentation',
    'Fine Lines & Aging',
    'Texture & Roughness',
    'Dullness & Uneven Tone',
    'Tanning',
    'Dryness',
    'Just Want a Simple Routine'
  ];
  const idx = priorities.indexOf(concern);
  return idx === -1 ? 0 : 10 - idx;
}

function getVitCFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend) return '';
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (p.routineLevel === 5) return isSensitive ? '1–2 mornings/week' : '2–3 mornings/week';
  if (p.routineLevel === 6) return isSensitive ? '2–3 mornings/week' : '3–5 mornings/week';
  return isSensitive ? '2–4 mornings/week' : 'Daily AM if tolerated';
}

function getRetinolFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend) return '';
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (p.routineLevel === 5) return '1 night/week';
  if (p.routineLevel === 6) return isSensitive ? '1–2 nights/week' : '2–3 nights/week';
  return isSensitive ? '2–3 nights/week' : '3–5 nights/week if tolerated';
}

function buildFixedMorningRoutine(p: SkinProfile, vitC: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];

  // 1. Cleanse (Real)
  steps.push({
    order: 1, category: 'cleanse', label: '01 — CLEANSE', slotName: 'Cleanse',
    productId: 'face-wash', productName: 'Avyora Face Wash', productSize: '100 ml',
    explanation: 'Start with Avyora Face Wash to gently cleanse the skin and prepare it for the rest of your routine.',
    isAvyoraProduct: true
  });

  // 2. Tone (CS)
  steps.push({
    order: 2, category: 'tone', label: '02 — TONE', slotName: 'Tone',
    productName: 'Hydrating Toner', explanation: 'A hydrating toner will help balance and prep your skin — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 3. Essence (CS)
  steps.push({
    order: 3, category: 'essence', label: '03 — ESSENCE', slotName: 'Essence',
    productName: 'Hydrating Essence', explanation: 'A lightweight essence step for extra hydration — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 4. Treat (Real if eligible)
  if (vitC) {
    steps.push({
      order: 4, category: 'brighten', label: '04 — TREAT', slotName: 'Treat',
      productId: 'vitamin-c-serum', productName: 'Avyora Vitamin C Serum', productSize: p.routineLevel === 5 ? '10 ml' : '30 ml',
      frequency: freq, explanation: 'Apply Avyora Vitamin C Serum to target the appearance of dullness and uneven-looking tone.',
      isAvyoraProduct: true
    });
  } else {
    steps.push({
      order: 4, category: 'treatment', label: '04 — TREAT', slotName: 'Treat',
      productName: 'Antioxidant Serum', explanation: 'This step is reserved for a future targeted treatment based on your profile — coming soon to Avyora.',
      isAvyoraProduct: false, isPlaceholder: true
    });
  }

  // 5. Eye Care (CS)
  steps.push({
    order: 5, category: 'eye', label: '05 — EYE CARE', slotName: 'Eye Care',
    productName: 'Eye Cream', explanation: 'A dedicated eye cream for the under-eye area — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 6. Moisturize (CS)
  steps.push({
    order: 6, category: 'hydrate', label: '06 — MOISTURIZE', slotName: 'Moisturize',
    productName: 'Facial Moisturizer', explanation: 'Apply a facial moisturizer to maintain hydration and support the skin barrier — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 7. Protect (Real)
  const ssSize = (p.routineLevel >= 6 || p.sunExposure === 'high') ? '50 ml' : '30 ml';
  steps.push({
    order: 7, category: 'protect', label: '07 — PROTECT', slotName: 'Protect',
    productId: 'sunscreen', productName: 'Avyora Sunscreen', productSize: ssSize,
    explanation: (p.sunExposure === 'high' && p.darkSpots !== 'no') 
      ? "Daily sun protection is especially important for your profile because pigmentation and frequent UV exposure can contribute to uneven-looking skin tone."
      : "Finish with Avyora Sunscreen to protect your skin from daily UV exposure.",
    isAvyoraProduct: true
  });

  return steps;
}

function buildFixedEveningRoutine(p: SkinProfile, retinol: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];

  // 1. First Cleanse (CS)
  steps.push({
    order: 1, category: 'cleanse', label: '01 — FIRST CLEANSE', slotName: 'First Cleanse',
    productName: 'Micellar/Oil Cleanser', explanation: 'An oil-based first cleanse can help lift sunscreen and makeup — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 2. Second Cleanse (Real)
  steps.push({
    order: 2, category: 'cleanse', label: '02 — SECOND CLEANSE', slotName: 'Second Cleanse',
    productId: 'face-wash', productName: 'Avyora Face Wash', productSize: '100 ml',
    explanation: 'Wash with Avyora Face Wash to fully cleanse the skin.',
    isAvyoraProduct: true
  });

  // 3. Exfoliate (CS)
  steps.push({
    order: 3, category: 'exfoliate', label: '03 — EXFOLIATE', slotName: 'Exfoliate',
    productName: 'Gentle Exfoliant', explanation: p.routineLevel === 4 ? 'Not part of your routine yet — coming soon to Avyora.' : 'A gentle exfoliating step for smoother-looking texture on scheduled nights — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 4. Tone (CS)
  steps.push({
    order: 4, category: 'tone', label: '04 — TONE', slotName: 'Tone',
    productName: 'Hydrating Toner', explanation: 'A hydrating toner to prep your skin before treatment — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 5. Treat (Real if eligible)
  if (retinol) {
    steps.push({
      order: 5, category: 'renew', label: '05 — TREAT', slotName: 'Treat',
      productId: 'retinol', productName: 'Avyora Retinol', productSize: p.routineLevel === 7 ? '90 ml' : '30 ml',
      frequency: freq, explanation: 'Apply Avyora Retinol on your scheduled treatment nights to target the appearance of fine lines and uneven texture.',
      isAvyoraProduct: true
    });
  } else {
    steps.push({
      order: 5, category: 'treatment', label: '05 — TREAT', slotName: 'Treat',
      productName: 'Repair Serum', explanation: 'This step is reserved for a future targeted treatment based on your profile — coming soon to Avyora.',
      isAvyoraProduct: false, isPlaceholder: true
    });
  }

  // 6. Eye Care (CS)
  steps.push({
    order: 6, category: 'eye', label: '06 — EYE CARE', slotName: 'Eye Care',
    productName: 'Night Eye Cream', explanation: 'A richer night eye cream — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  // 7. Moisturize (CS)
  steps.push({
    order: 7, category: 'hydrate', label: '07 — MOISTURIZE', slotName: 'Moisturize',
    productName: 'Night Moisturizer', explanation: 'Finish with a facial moisturizer to lock in hydration overnight — coming soon to Avyora.',
    isAvyoraProduct: false, isPlaceholder: true
  });

  return steps;
}

function buildBodyRoutine(p: SkinProfile): RoutineStep[] {
  if (!p.bodyCare) return [];
  return [{
    order: 1, category: 'body', label: 'BODY CARE', slotName: 'Body care',
    productId: 'body-lotion', productName: 'Avyora Body Lotion', productSize: '180 ml',
    explanation: 'Apply Avyora Body Lotion after bathing to moisturize the body and help relieve dryness.',
    isAvyoraProduct: true
  }];
}

function mapProductSizes(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[], p: SkinProfile) {
  const all = [...am, ...pm, ...body];
  const unique = new Map<string, string>();
  all.forEach(s => {
    if (s.isAvyoraProduct && s.productId) unique.set(s.productId, s.productSize || '');
  });
  return Array.from(unique.entries()).map(([productId, size]) => ({ productId, size }));
}

function getExperienceName(exp: ExperienceLevel): string {
  const map = { 'N0': 'MINIMAL', 'N1': 'BEGINNER', 'N2': 'REGULAR', 'N3': 'SERIOUS', 'N4': 'ADVANCED' };
  return map[exp] || 'PERSONALIZED';
}

function getMorningTitle(p: SkinProfile, vitC: boolean, retinol: boolean): string {
  if (vitC && p.routineLevel === 7) return "Brighten & Protect";
  if (p.primaryConcern === 'Dullness & Uneven Tone') return "Brighten & Protect";
  if (p.reactivity === 'high') return "Calm, Hydrate & Protect";
  return "Protect & Hydrate";
}

function getEveningTitle(p: SkinProfile, retinol: boolean): string {
  if (retinol) return "Renew & Restore";
  return "Cleanse & Hydrate";
}

function getUnderEyeGuidance(p: SkinProfile): string | undefined {
  if (p.darkCircles === 'no') return undefined;
  return "You indicated that dark circles are one of your concerns. Keep the area gently hydrated and protected from daily sun exposure. A dedicated eye-care product may be considered separately.";
}

function getWarnings(p: SkinProfile, retinol: boolean): string[] {
  const w = [];
  if (p.reactivity === 'high') w.push("Your skin is highly reactive. Introduce only one new product at a time.");
  if (retinol) w.push("Retinol increases sun sensitivity. Daily sunscreen is mandatory.");
  return w;
}

function getExplanations(p: SkinProfile, vitC: boolean, retinol: boolean): string[] {
  const exps = [];
  if (vitC && retinol) exps.push("Vitamin C is placed in your morning routine and Retinol in your evening routine so the actives are separated across the day.");
  return exps;
}

function getPriorities(p: SkinProfile): string[] {
  const priorities = [];
  if (p.reactivity === 'very_high') priorities.push("01 — SOOTHING IRRITATION");
  if (p.primaryConcern.includes('Acne')) priorities.push("01 — ACNE CONTROL");
  if (p.darkSpots !== 'no') priorities.push("01 — DARK SPOTS");
  priorities.push("03 — SUN PROTECTION");
  return priorities.slice(0, 3);
}

function generateWhyThisRoutine(p: SkinProfile, vitC: boolean, retinol: boolean): string {
  const concerns = [p.primaryConcern, ...p.secondaryConcerns].filter(c => c !== 'None').join(' and ');
  return `You selected ${concerns.toLowerCase()}, have ${p.skinType} skin, and are at a ${getExperienceName(p.experienceLevel).toLowerCase()} level. Your routine combines ${vitC && retinol ? 'Vitamin C in the morning with Retinol at night' : vitC ? 'targeted Vitamin C support' : retinol ? 'gradual Retinol introduction' : 'barrier-focused care'} while daily sunscreen remains the foundation.`;
}

function getRetinolSchedule(p: SkinProfile): string {
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  if (isSensitive) return "Week 1–4: 1–2 nights/week. Introduce very gradually.";
  return "Week 1–2: 2 nights/week. Week 3–4: 3 nights/week if tolerated.";
}
