import { SkinProfile, RecommendationResult, RoutineStep, RoutineLevel, ExperienceLevel, ReactivityLevel } from './routine-types';

/**
 * STRICT RULE-BASED MODE: The recommendation engine does not invent or use general skincare knowledge.
 * Every recommendation comes from the Avyora Master Table.
 */

export function getRecommendation(answers: any): RecommendationResult {
  const profile = normalizeAnswers(answers);
  
  // Table 7: Hard Exclusions
  const retinolExclusions = checkRetinolExclusions(profile);
  
  // Table 5: Vit C Eligibility
  const vitCEligible = checkVitCEligibility(profile);
  
  // Table 8: Retinol Eligibility
  const retinolEligible = !retinolExclusions && checkRetinolQualifying(profile);
  
  // Active Selection based on Level Complexity (Table 17, 18, 19)
  const { recommendVitaminC, recommendRetinol } = selectActives(profile, vitCEligible, retinolEligible);

  // Frequencies (Table 6, 9)
  const vitCFreq = getVitCFrequency(profile, recommendVitaminC);
  const retinolFreq = getRetinolFrequency(profile, recommendRetinol);

  // Routine Construction (Table 20, 21)
  const morningRoutine = buildMorningRoutine(profile, recommendVitaminC, vitCFreq);
  const eveningRoutine = buildEveningRoutine(profile, recommendRetinol, retinolFreq);
  const bodyRoutine = buildBodyRoutine(profile);

  // Size Mapping (Table 22)
  const recommendedProducts = mapProductSizes(morningRoutine, eveningRoutine, bodyRoutine, profile);

  // Validation (Table 28)
  validateRoutine(morningRoutine, eveningRoutine, profile);

  // Presentation Layer (Table 26, 27)
  return {
    profile,
    experienceLevelName: getExperienceName(profile.experienceLevel),
    morningTitle: getMorningTitle(profile, recommendVitaminC, recommendRetinol),
    eveningTitle: getEveningTitle(profile, recommendRetinol),
    morningIntro: getMorningIntro(profile, recommendVitaminC),
    eveningIntro: getEveningIntro(profile, recommendRetinol),
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
  const routineLevel = levelMap[exp];

  const reactMap: Record<string, ReactivityLevel> = {
    'rarely': 'low',
    'sometimes': 'medium',
    'easily': 'high',
    'very': 'very_high'
  };

  return {
    primaryConcern: a.concern,
    secondaryConcerns: a.secondaryConcerns || [],
    skinType: a.skinType,
    reactivity: reactMap[a.reactivity] || 'low',
    ageRange: a.age,
    sunExposure: a.sun,
    experienceLevel: exp,
    routineLevel,
    consistency: a.consistency,
    currentCondition: a.currentCondition,
    darkCircles: a.darkCircles || 'no',
    darkSpots: a.darkSpots || 'no',
    bodyCare: a.bodyCare === 'yes',
  };
}

function checkVitCEligibility(p: SkinProfile): boolean {
  const qualifying = ['Dark Spots & Pigmentation', 'Dullness & Uneven Tone', 'Tanning', 'dark-spots', 'dullness', 'uneven', 'tanning'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function checkRetinolExclusions(p: SkinProfile): boolean {
  if (p.ageRange === 'under18') return true;
  if (p.reactivity === 'very_high') return true;
  if (p.currentCondition === 'irritated') return true;
  if (p.routineLevel === 4) return true;
  if (p.primaryConcern === 'Just Want a Simple Routine') return true;
  if (p.primaryConcern === 'Dryness' && p.secondaryConcerns.length === 0) return true;
  return false;
}

function checkRetinolQualifying(p: SkinProfile): boolean {
  const qualifying = ['Fine Lines & Aging', 'Texture & Roughness', 'Dark Spots & Pigmentation', 'aging', 'lines', 'texture', 'dark-spots'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function selectActives(p: SkinProfile, vitC: boolean, retinol: boolean) {
  const result = { recommendVitaminC: false, recommendRetinol: false };

  if (p.routineLevel === 4) return result;

  if (p.routineLevel === 5) {
    if (vitC) result.recommendVitaminC = true;
    else if (retinol) result.recommendRetinol = true;
    return result;
  }

  if (p.routineLevel === 6) {
    if (vitC && !retinol) result.recommendVitaminC = true;
    else if (retinol && !vitC) result.recommendRetinol = true;
    else if (vitC && retinol) {
      // Prioritize per Table 25
      const vitCPrio = getPriority(p.primaryConcern, 'vitamin-c');
      const retPrio = getPriority(p.primaryConcern, 'retinol');
      if (vitCPrio >= retPrio) result.recommendVitaminC = true;
      else result.recommendRetinol = true;
    }
    return result;
  }

  result.recommendVitaminC = vitC;
  result.recommendRetinol = retinol;
  
  // Conflict Rule Table 24
  if (p.reactivity === 'very_high' || p.currentCondition === 'irritated') {
    result.recommendVitaminC = false;
    result.recommendRetinol = false;
  }

  return result;
}

function getPriority(concern: string, active: string): number {
  const list = ['Dark Spots / pigmentation', 'Fine Lines / aging', 'Texture', 'Dullness', 'Tanning'];
  const idx = list.indexOf(concern);
  if (idx === -1) return 0;
  return 10 - idx;
}

function getVitCFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend || p.reactivity === 'very_high') return '';
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (p.routineLevel === 5) return isSensitive ? '1–2 mornings/week' : '2–3 mornings/week';
  if (p.routineLevel === 6) return isSensitive ? '2–3 mornings/week' : '3–5 mornings/week';
  return isSensitive ? '2–4 mornings/week' : 'Every morning if tolerated';
}

function getRetinolFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend) return '';
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (p.routineLevel === 5) return isSensitive ? 'Usually defer' : '1–2 nights/week';
  if (p.routineLevel === 6) return isSensitive ? '1–2 nights/week' : '2–3 nights/week';
  if (p.routineLevel === 7) return isSensitive ? '2–3 nights/week' : '3–5 nights/week if tolerated';
  return '';
}

function buildMorningRoutine(p: SkinProfile, vitC: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];
  
  steps.push({
    order: 1,
    category: 'cleanse',
    label: '01 — CLEANSE',
    productId: 'face-wash',
    productName: 'Avyora Face Wash',
    productSize: '100 ml',
    explanation: 'Start with Avyora Face Wash to cleanse the skin and prepare it for the rest of your routine.',
    isAvyoraProduct: true
  });

  if (vitC && freq) {
    steps.push({
      order: 2,
      category: 'brighten',
      label: '02 — BRIGHTEN',
      productId: 'vitamin-c-serum',
      productName: 'Avyora Vitamin C Serum',
      productSize: p.routineLevel === 5 ? '10 ml' : '30 ml',
      frequency: freq,
      explanation: 'Vitamin C is included because your answers indicate dullness, uneven tone, tanning or pigmentation concerns.',
      isAvyoraProduct: true
    });
  }

  steps.push({
    order: steps.length + 1,
    category: 'hydrate',
    label: `0${steps.length + 1} — HYDRATE`,
    productName: 'Facial Moisturizer',
    productSize: 'Coming Soon / External Product',
    explanation: 'Use a facial moisturizer to maintain hydration and support the skin barrier.',
    isAvyoraProduct: false,
    isPlaceholder: true
  });

  steps.push({
    order: steps.length + 1,
    category: 'protect',
    label: `0${steps.length + 1} — PROTECT`,
    productId: 'sunscreen',
    productName: 'Avyora Sunscreen',
    productSize: (p.routineLevel >= 6 || p.sunExposure === 'high') ? '50 ml' : '30 ml',
    explanation: p.sunExposure === 'high' && p.darkSpots !== 'no' 
      ? "Daily sun protection is especially important for your profile because pigmentation and frequent UV exposure can contribute to uneven-looking skin tone."
      : "Finish your morning routine with sunscreen to protect your skin from daily UV exposure.",
    isAvyoraProduct: true
  });

  return steps;
}

function buildEveningRoutine(p: SkinProfile, retinol: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];
  
  steps.push({
    order: 1,
    category: 'cleanse',
    label: '01 — CLEANSE',
    productId: 'face-wash',
    productName: 'Avyora Face Wash',
    productSize: '100 ml',
    explanation: 'Start with Avyora Face Wash to cleanse the skin and prepare it for the rest of your routine.',
    isAvyoraProduct: true
  });

  if (retinol && freq && freq !== 'Usually defer') {
    steps.push({
      order: 2,
      category: 'treatment',
      label: '02 — TREAT',
      productId: 'retinol',
      productName: 'Avyora Retinol',
      productSize: p.routineLevel === 7 ? '90 ml' : '30 ml',
      frequency: freq,
      explanation: 'Retinol is included because your answers indicate concerns such as fine lines, texture or pigmentation and your profile is suitable for a gradual active routine.',
      isAvyoraProduct: true
    });
  }

  steps.push({
    order: steps.length + 1,
    category: 'hydrate',
    label: `0${steps.length + 1} — HYDRATE`,
    productName: 'Facial Moisturizer',
    productSize: 'Coming Soon / External Product',
    explanation: 'Use a facial moisturizer to maintain hydration and support the skin barrier.',
    isAvyoraProduct: false,
    isPlaceholder: true
  });

  return steps;
}

function buildBodyRoutine(p: SkinProfile): RoutineStep[] {
  if (!p.bodyCare) return [];
  return [{
    order: 1,
    category: 'body',
    label: 'BODY CARE',
    productId: 'body-lotion',
    productName: 'Avyora Body Lotion',
    productSize: '180 ml',
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
  if (vitC && retinol && p.routineLevel === 7) return "Brighten & Protect";
  if (p.primaryConcern === 'Dullness & Uneven Tone') return "Brighten & Protect";
  if (p.primaryConcern === 'Dark Spots & Pigmentation') return "Brighten & Protect";
  if (p.reactivity === 'high') return "Calm, Hydrate & Protect";
  if (p.primaryConcern === 'Dryness') return "Hydrate & Protect";
  return "Protect & Hydrate";
}

function getEveningTitle(p: SkinProfile, retinol: boolean): string {
  if (retinol) return "Renew & Restore";
  if (p.reactivity === 'high') return "Calm & Restore";
  return "Cleanse & Hydrate";
}

function getMorningIntro(p: SkinProfile, vitC: boolean): string {
  if (vitC) return "Your morning routine focuses on supporting a more even-looking complexion while protecting your skin from daily UV exposure.";
  return "Your morning routine focuses on gentle cleansing and hydration, with a essential final step of sun protection.";
}

function getEveningIntro(p: SkinProfile, retinol: boolean): string {
  if (retinol) return "Your evening routine focuses on cleansing away the day's buildup, followed by a targeted treatment on scheduled nights.";
  return "Your evening routine focuses on thorough cleansing and moisture replenishment to support skin recovery overnight.";
}

function getUnderEyeGuidance(p: SkinProfile): string | undefined {
  if (p.darkCircles === 'no') return undefined;
  return "Your answers indicate an under-eye concern. Maintain gentle hydration and daily sun protection; a dedicated eye-care product may be considered separately.";
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
  if (p.darkSpots !== 'no') exps.push("Your routine combines morning antioxidant support with controlled nighttime treatment while keeping sun protection as a daily foundation.");
  return exps;
}

function getPriorities(p: SkinProfile): string[] {
  const priorities = [];
  if (p.reactivity === 'very_high') priorities.push("01 — SOOTHING IRRITATION");
  if (p.primaryConcern.includes('Acne')) priorities.push("01 — ACNE CONTROL");
  if (p.darkSpots !== 'no') priorities.push("01 — DARK SPOTS");
  if (p.primaryConcern.includes('Aging')) priorities.push("02 — FINE LINES");
  priorities.push("03 — SUN PROTECTION");
  return priorities.slice(0, 3);
}

function generateWhyThisRoutine(p: SkinProfile, vitC: boolean, retinol: boolean): string {
  const concerns = [p.primaryConcern, ...p.secondaryConcerns].filter(c => c !== 'None').join(' and ');
  return `You selected ${concerns.toLowerCase()}, have ${p.skinType} skin, and are at a ${getExperienceName(p.experienceLevel).toLowerCase()} level. Your routine therefore focuses on ${vitC && retinol ? 'combining Vitamin C and Retinol' : vitC ? 'targeted Vitamin C support' : retinol ? 'gradual Retinol introduction' : 'barrier-focused care'} while keeping hydration and sun protection as your daily foundation.`;
}

function getRetinolSchedule(p: SkinProfile): string {
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  if (isSensitive) return "Week 1–4: 1–2 nights/week. Introduce very gradually.";
  if (p.experienceLevel === 'N4') return "Week 1–2: 3 nights/week. Ongoing: 3–5 nights/week if tolerated.";
  return "Week 1–2: 2 nights/week. Week 3–4: 3 nights/week if tolerated.";
}

function validateRoutine(am: RoutineStep[], pm: RoutineStep[], p: SkinProfile) {
  const amIds = am.map(s => s.productId);
  const pmIds = pm.map(s => s.productId);
  if (!amIds.includes('face-wash') || !pmIds.includes('face-wash')) throw new Error('Face Wash missing');
  if (!amIds.includes('sunscreen')) throw new Error('Sunscreen missing in AM');
  if (pmIds.includes('sunscreen')) throw new Error('Sunscreen in PM');
  if (p.ageRange === 'under18' && pmIds.includes('retinol')) throw new Error('Retinol restricted for minors');
}
