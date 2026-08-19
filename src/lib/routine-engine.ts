import { SkinProfile, RecommendationResult, RoutineStep, ExperienceLevel, ReactivityLevel, RoutineLevel } from './routine-types';

/**
 * STRICT RULE-BASED MODE: The recommendation engine does not invent or use general skincare knowledge.
 * Every recommendation comes from the Avyora Master Recommender Table.
 */

export function getRecommendation(answers: any): RecommendationResult {
  const profile = normalizeProfile(answers);

  // 1. Eligibility Checks
  const vitCEligible = isVitaminCEligible(profile);
  const retinolEligible = isRetinolEligible(profile);

  // 2. Active Selection based on Level Complexity (Table 1, 17, 18, 19)
  const { recommendVitaminC, recommendRetinol } = selectActives(profile, vitCEligible, retinolEligible);

  // 3. Frequencies (Table 6, 7, 9)
  const vitCFreq = getVitaminCFrequency(profile, recommendVitaminC);
  const retinolFreq = getRetinolFrequency(profile, recommendRetinol);

  // 4. Build Routines (Table 20, 21)
  const morningRoutine = buildMorningRoutine(profile, recommendVitaminC, vitCFreq);
  const eveningRoutine = buildEveningRoutine(profile, recommendRetinol, retinolFreq);
  const bodyRoutine = buildBodyRoutine(profile);

  // 5. Product Mapping (Table 22)
  const recommendedProducts = mapRoutineToProducts(morningRoutine, eveningRoutine, bodyRoutine, profile);

  // 6. Validation (Table 27)
  validateRoutine(morningRoutine, eveningRoutine, profile);

  return {
    profile,
    experienceLevel: profile.experienceLevel,
    priorityConcerns: getPriorityConcerns(profile),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    underEyeGuidance: getUnderEyeGuidance(profile),
    warnings: getWarnings(profile, recommendRetinol),
    explanations: getExplanations(profile, recommendVitaminC, recommendRetinol),
    recommendedProducts,
    treatmentSchedule: {
      retinol: recommendRetinol ? getRetinolSchedule(profile) : undefined,
    }
  };
}

function normalizeProfile(answers: any): SkinProfile {
  const expMap: Record<string, ExperienceLevel> = {
    'none': 'N0',
    'beginner': 'N1',
    'basic': 'N2',
    'regular': 'N2',
    'experienced': 'N4'
  };
  const exp = expMap[answers.experience] || 'N0';
  
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
    primaryConcern: answers.concern,
    secondaryConcerns: answers.secondaryConcerns || [],
    skinType: answers.skinType,
    reactivity: reactMap[answers.reactivity] || 'low',
    ageRange: answers.age,
    sunExposure: answers.sun,
    experienceLevel: exp,
    routineLevel,
    consistency: answers.consistency,
    currentCondition: answers.currentCondition,
    darkCircles: answers.darkCircles || 'no',
    darkSpots: answers.darkSpots || 'no',
    bodyCare: answers.bodyCare === 'yes',
  };
}

function isVitaminCEligible(p: SkinProfile): boolean {
  if (p.reactivity === 'very_high') return false;

  const qualifying = ['Dark Spots & Pigmentation', 'Dullness & Uneven Tone', 'Tanning', 'dark-spots', 'dullness', 'uneven', 'tanning'];
  const hasQualifying = qualifying.includes(p.primaryConcern) || 
                        p.secondaryConcerns.some(c => qualifying.includes(c));

  return hasQualifying;
}

function isRetinolEligible(p: SkinProfile): boolean {
  // Hard Exclusions (Table 7)
  if (p.ageRange === 'under18') return false;
  if (p.reactivity === 'very_high') return false;
  if (p.currentCondition === 'irritated') return false;
  if (p.routineLevel === 4) return false;
  if (p.primaryConcern === 'Just Want a Simple Routine') return false;
  if (p.primaryConcern === 'Dryness' && p.secondaryConcerns.length === 0) return false;

  // Qualifying Concerns (Table 8)
  const qualifying = ['Fine Lines & Aging', 'Texture & Roughness', 'Dark Spots & Pigmentation', 'aging', 'lines', 'texture', 'dark-spots'];
  const hasQualifying = qualifying.includes(p.primaryConcern) || 
                        p.secondaryConcerns.some(c => qualifying.includes(c));

  if (!hasQualifying) return false;

  // Age/Exp Modifier (Table 11)
  if (p.ageRange === '18_24' && p.routineLevel < 7) return false;

  return true;
}

function selectActives(p: SkinProfile, vitC: boolean, retinol: boolean): { recommendVitaminC: boolean; recommendRetinol: boolean } {
  const result = { recommendVitaminC: false, recommendRetinol: false };

  if (p.routineLevel === 4) return result;

  if (p.routineLevel === 5) {
    // Level 5: Max 1 active (Table 17)
    if (vitC) result.recommendVitaminC = true;
    else if (retinol) result.recommendRetinol = true;
    return result;
  }

  if (p.routineLevel === 6) {
    // Level 6: Max 1 major active usually (Table 18)
    if (vitC && !retinol) result.recommendVitaminC = true;
    else if (retinol && !vitC) result.recommendRetinol = true;
    else if (vitC && retinol) {
      // Pick based on priority (Table 25)
      const vitCPrio = getPriorityScore(p.primaryConcern, 'vitamin-c');
      const retPrio = getPriorityScore(p.primaryConcern, 'retinol');
      if (vitCPrio >= retPrio) result.recommendVitaminC = true;
      else result.recommendRetinol = true;
    }
    return result;
  }

  // Level 7: Both allowed if eligible (Table 19)
  result.recommendVitaminC = vitC;
  result.recommendRetinol = retinol;

  return result;
}

function getPriorityScore(concern: string, active: string): number {
  const order = ['Dark Spots & Pigmentation', 'Fine Lines & Aging', 'Texture & Roughness', 'Dullness & Uneven Tone', 'Tanning'];
  const idx = order.indexOf(concern);
  if (idx === -1) return 0;
  
  if (active === 'vitamin-c' && (concern.includes('Dark Spots') || concern.includes('Dullness') || concern.includes('Tanning'))) return 10 - idx;
  if (active === 'retinol' && (concern.includes('Fine Lines') || concern.includes('Texture') || concern.includes('Dark Spots'))) return 10 - idx;
  
  return 0;
}

function getVitaminCFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend) return 'None';
  if (p.reactivity === 'very_high') return 'Defer';

  const freqMap: Record<RoutineLevel, string> = {
    4: 'Do not use',
    5: p.reactivity === 'high' ? '1–2 mornings/week' : '2–3 mornings/week',
    6: p.reactivity === 'high' ? '2–3 mornings/week' : '3–5 mornings/week',
    7: p.reactivity === 'high' ? '2–4 mornings/week' : 'Every morning if tolerated'
  };

  return freqMap[p.routineLevel];
}

function getRetinolFrequency(p: SkinProfile, recommend: boolean): string {
  if (!recommend) return 'None';
  
  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (p.routineLevel === 5) return isSensitive ? 'Usually defer' : '1–2 nights/week';
  if (p.routineLevel === 6) return isSensitive ? '1–2 nights/week' : '2–3 nights/week';
  if (p.routineLevel === 7) return isSensitive ? '2–3 nights/week' : '3–5 nights/week';
  
  return 'None';
}

function buildMorningRoutine(p: SkinProfile, vitC: boolean, freq: string): RoutineStep[] {
  const routine: RoutineStep[] = [];
  
  // 1. Cleanse (Table 20)
  routine.push({
    order: 1,
    category: 'cleanse',
    label: '01 — CLEANSE',
    productId: 'face-wash',
    productName: 'Avyora Face Wash',
    productSize: '100 ml',
    explanation: 'Start with Avyora Face Wash to cleanse the skin and prepare it for the rest of your routine.',
    isAvyoraProduct: true
  });

  // 2. Vitamin C (Table 20)
  if (vitC && freq !== 'Defer' && freq !== 'Do not use') {
    routine.push({
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

  // 3. Moisturizer (Table 20)
  routine.push({
    order: routine.length + 1,
    category: 'hydrate',
    label: routine.length === 1 ? '02 — HYDRATE' : '03 — HYDRATE',
    productName: 'Facial Moisturizer',
    productSize: 'Recommended routine step',
    explanation: 'Use a facial moisturizer to maintain hydration and support the skin barrier.',
    isAvyoraProduct: false
  });

  // 4. Sunscreen (Table 20)
  const sunSize = (p.routineLevel >= 6 || p.sunExposure === 'high') ? '50 ml' : '30 ml';
  routine.push({
    order: routine.length + 1,
    category: 'protect',
    label: routine.length === 2 ? '03 — PROTECT' : '04 — PROTECT',
    productId: 'sunscreen',
    productName: 'Avyora Sunscreen',
    productSize: sunSize,
    explanation: 'Finish your morning routine with sunscreen to protect your skin from daily UV exposure.',
    isAvyoraProduct: true
  });

  return routine;
}

function buildEveningRoutine(p: SkinProfile, retinol: boolean, freq: string): RoutineStep[] {
  const routine: RoutineStep[] = [];

  // 1. Cleanse (Table 20)
  routine.push({
    order: 1,
    category: 'cleanse',
    label: '01 — CLEANSE',
    productId: 'face-wash',
    productName: 'Avyora Face Wash',
    productSize: '100 ml',
    explanation: 'Start with Avyora Face Wash to cleanse the skin and prepare it for the rest of your routine.',
    isAvyoraProduct: true
  });

  // 2. Retinol (Table 20)
  if (retinol && freq !== 'Usually defer' && freq !== 'Defer') {
    routine.push({
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

  // 3. Moisturizer (Table 20)
  routine.push({
    order: routine.length + 1,
    category: 'hydrate',
    label: routine.length === 1 ? '02 — HYDRATE' : '03 — HYDRATE',
    productName: 'Facial Moisturizer',
    productSize: 'Recommended routine step',
    explanation: 'Use a facial moisturizer to maintain hydration and support the skin barrier.',
    isAvyoraProduct: false
  });

  return routine;
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

function getPriorityConcerns(p: SkinProfile): string[] {
  const list = [
    { p: 1, c: 'Skin irritation / high sensitivity', active: p.reactivity === 'very_high' || p.currentCondition === 'irritated' },
    { p: 2, c: 'Active acne', active: p.primaryConcern.includes('Acne') },
    { p: 3, c: 'Dark spots / pigmentation', active: p.darkSpots !== 'no' || p.primaryConcern.includes('Dark Spots') },
    { p: 4, c: 'Fine lines / aging', active: p.primaryConcern.includes('Aging') },
    { p: 5, c: 'Texture', active: p.primaryConcern.includes('Texture') },
    { p: 6, c: 'Dullness', active: p.primaryConcern.includes('Dullness') },
    { p: 7, c: 'Tanning', active: p.secondaryConcerns.includes('tanning') },
    { p: 8, c: 'Dryness', active: p.primaryConcern.includes('Dryness') || p.skinType === 'dry' },
    { p: 9, c: 'Maintenance', active: true },
  ];
  return list.filter(item => item.active).sort((a, b) => a.p - b.p).map(item => item.c.toUpperCase()).slice(0, 3);
}

function getUnderEyeGuidance(p: SkinProfile): string | undefined {
  if (p.darkCircles === 'no') return undefined;
  return 'Your answers indicate an under-eye concern. Maintain gentle hydration and daily sun protection; a dedicated eye-care product may be considered separately.';
}

function getWarnings(p: SkinProfile, retinol: boolean): string[] {
  const warnings = [];
  if (p.reactivity === 'high') warnings.push("Your skin is highly reactive. Introduce only one new product at a time and patch test.");
  if (p.currentCondition === 'irritated') warnings.push("Your skin is currently irritated. Focus on the core Cleanse + Hydrate routine until the barrier recovers.");
  if (retinol) warnings.push("Retinol increases sun sensitivity. Daily sunscreen is mandatory.");
  return warnings;
}

function getExplanations(p: SkinProfile, vitC: boolean, retinol: boolean): string[] {
  const exps = [];
  if (vitC && retinol) {
    exps.push("Vitamin C is placed in your morning routine and Retinol in your evening routine so the actives are separated across the day.");
  }
  if (p.darkSpots !== 'no') {
    exps.push("Your routine is designed to support a more even-looking complexion while keeping daily sun protection as a core step.");
  }
  if (p.skinType === 'dry') {
    exps.push("Focus on maintaining a strong hydration foundation before increasing active frequency.");
  }
  return exps;
}

function getRetinolSchedule(p: SkinProfile): string {
  if (p.experienceLevel === 'N1' || p.reactivity === 'high') {
    return "Week 1–4: 1–2 nights/week. Very gradual introduction required.";
  }
  return "Week 1–2: 2 nights/week. Week 3–4: 3 nights/week if tolerated. Ongoing: Increase gradually based on tolerance.";
}

function mapRoutineToProducts(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[], p: SkinProfile): { productId: string; size: string }[] {
  const all = [...am, ...pm, ...body];
  const unique = new Map<string, string>();
  
  all.forEach(step => {
    if (step.isAvyoraProduct && step.productId) {
      unique.set(step.productId, step.productSize || '');
    }
  });

  return Array.from(unique.entries()).map(([id, size]) => ({ productId: id, size }));
}

function validateRoutine(am: RoutineStep[], pm: RoutineStep[], p: SkinProfile) {
  const amIds = am.map(s => s.productId);
  const pmIds = pm.map(s => s.productId);

  if (!amIds.includes('face-wash')) throw new Error('Face Wash missing from AM');
  if (!pmIds.includes('face-wash')) throw new Error('Face Wash missing from PM');
  if (!amIds.includes('sunscreen')) throw new Error('Sunscreen missing from AM');
  if (pmIds.includes('sunscreen')) throw new Error('Sunscreen should not be in PM');
  
  const retinolIdx = pm.findIndex(s => s.productId === 'retinol');
  if (retinolIdx !== -1) {
    if (p.ageRange === 'under18') throw new Error('Retinol recommended for minor');
    if (p.reactivity === 'very_high') throw new Error('Retinol recommended for very reactive skin');
  }
}
