
import { SkinProfile, RecommendationResult, RoutineStep, RoutineLevel, ExperienceLevel, ReactivityLevel } from './routine-types';

/**
 * AVYORA 7-PHASE ENGINE (Deterministic Matrix)
 */

export function getRecommendation(answers: any): RecommendationResult {
  const profile = normalizeAnswers(answers);
  
  // 1. Initial Evaluations
  const retinolExclusions = checkRetinolExclusions(profile);
  const vitCEligible = checkVitCEligibility(profile);
  const retinolEligible = !retinolExclusions && checkRetinolQualifying(profile);
  
  // 2. Active Logic
  const { recommendVitaminC, recommendRetinol } = selectActives(profile, vitCEligible, retinolEligible);

  // 3. Frequencies
  const vitCFreq = getVitCFrequency(profile, recommendVitaminC);
  const retinolFreq = getRetinolFrequency(profile, recommendRetinol);

  // 4. Build Fixed 7+7 Structure
  const morningRoutine = buildFixed7StepMorning(profile, recommendVitaminC, vitCFreq);
  const eveningRoutine = buildFixed7StepEvening(profile, recommendRetinol, retinolFreq);
  const bodyRoutine = buildBodyRoutine(profile);

  // 5. Size & Product Mapping
  const recommendedProducts = mapProductSizes(morningRoutine, eveningRoutine, bodyRoutine, profile);

  return {
    profile,
    experienceLevelName: getExperienceName(profile.experienceLevel),
    morningTitle: getMorningTitle(profile),
    eveningTitle: getEveningTitle(profile),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    underEyeGuidance: getUnderEyeGuidance(profile),
    warnings: getWarnings(profile, recommendRetinol),
    explanations: [],
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
  const levelMap: Record<ExperienceLevel, RoutineLevel> = { 'N0': 4, 'N1': 5, 'N2': 6, 'N3': 7, 'N4': 7 };
  const reactMap: Record<string, ReactivityLevel> = { 'rarely': 'low', 'sometimes': 'medium', 'easily': 'high', 'very_high': 'very_high' };

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
  const qualifying = ['Dark Spots & Pigmentation', 'Dullness & Uneven Tone', 'Tanning', 'dark-spots', 'dullness', 'uneven', 'tanning'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function checkRetinolExclusions(p: SkinProfile): boolean {
  if (p.ageRange === 'under18' || p.reactivity === 'very_high' || p.currentCondition === 'irritated' || p.routineLevel === 4) return true;
  return false;
}

function checkRetinolQualifying(p: SkinProfile): boolean {
  const qualifying = ['Fine Lines & Aging', 'Texture & Roughness', 'Dark Spots & Pigmentation', 'aging', 'lines', 'texture', 'dark-spots'];
  return qualifying.includes(p.primaryConcern) || p.secondaryConcerns.some(c => qualifying.includes(c));
}

function selectActives(p: SkinProfile, vitC: boolean, retinol: boolean) {
  if (p.routineLevel === 4) return { recommendVitaminC: false, recommendRetinol: false };
  if (p.routineLevel === 5) {
    if (vitC && retinol) {
      const prio = ['Acne', 'Dark Spots', 'Aging', 'Texture', 'Dullness'];
      const pIdx = prio.findIndex(c => p.primaryConcern.includes(c));
      if (pIdx >= 2) return { recommendVitaminC: false, recommendRetinol: true };
      return { recommendVitaminC: true, recommendRetinol: false };
    }
    return { recommendVitaminC: vitC, recommendRetinol: retinol };
  }
  return { recommendVitaminC: vitC, recommendRetinol: retinol };
}

function getVitCFrequency(p: SkinProfile, rec: boolean) {
  if (!rec) return '';
  if (p.routineLevel === 5) return '2–3 mornings/week';
  if (p.routineLevel === 6) return '3–5 mornings/week';
  return 'Daily AM if tolerated';
}

function getRetinolFrequency(p: SkinProfile, rec: boolean) {
  if (!rec) return '';
  if (p.routineLevel === 5) return '1 night/week';
  if (p.routineLevel === 6) return '2–3 nights/week';
  return '3–5 nights/week if tolerated';
}

function buildFixed7StepMorning(p: SkinProfile, vitC: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];
  const isOily = p.skinType === 'oily';
  const isDry = p.skinType === 'dry';

  // 1. CLEANSE
  steps.push({
    order: 1, category: 'cleanse', label: '01 — CLEANSE', slotName: 'Cleanse',
    productId: 'amino-acid-gel-cleanser', productName: 'Amino Acid Gel Cleanser', productSize: '150ml',
    explanation: 'Start with Amino Acid Gel Cleanser to gently cleanse the skin without stripping lipids.',
    isAvyoraProduct: true
  });

  // 2. TONE
  steps.push({
    order: 2, category: 'tone', label: '02 — TONE', slotName: 'Tone',
    productId: isDry ? 'rice-toner' : 'ha-toner', productName: isDry ? 'Milky Rice Toner' : 'Multi-Molecular HA Toner',
    explanation: 'A hydrating toner helps balance pH and flood skin with initial moisture.',
    isAvyoraProduct: true
  });

  // 3. ESSENCE
  steps.push({
    order: 3, category: 'essence', label: '03 — ESSENCE', slotName: 'Essence',
    productId: 'galacto-essence', productName: 'Galactomyces Ferment Essence',
    explanation: 'This high-penetration elixir creates a translucent, light-reflective base.',
    isAvyoraProduct: true
  });

  // 4. TREAT
  if (vitC) {
    steps.push({
      order: 4, category: 'brighten', label: '04 — TREAT', slotName: 'Treat',
      productId: 'vitamin-c-serum', productName: 'Avyora Vitamin C Serum',
      frequency: freq, explanation: 'Apply Vitamin C Serum to target dullness and protect against daily oxidation.',
      isAvyoraProduct: true
    });
  } else {
    steps.push({
      order: 4, category: 'treatment', label: '04 — TREAT', slotName: 'Treat',
      productId: 'niacinamide-drops', productName: '10% Niacinamide Glow Drops',
      explanation: 'Niacinamide regulates oil and keeps pores clear for a glassy finish.',
      isAvyoraProduct: true
    });
  }

  // 5. EYE CARE
  steps.push({
    order: 5, category: 'eye', label: '05 — EYE CARE', slotName: 'Eye Care',
    productId: 'eye-patches', productName: 'Caffeine & Peptide Eye Patches',
    explanation: 'Use patches to instantly drain puffiness and plump fine lines around the eyes.',
    isAvyoraProduct: true
  });

  // 6. MOISTURIZE
  steps.push({
    order: 6, category: 'hydrate', label: '06 — MOISTURIZE', slotName: 'Moisturize',
    productId: isOily ? 'sorbet-moisturizer' : 'ceramide-cream', productName: isOily ? 'Water-Gel Sorbet Moisturizer' : '5x Essential Ceramide Cream',
    explanation: 'Seal in hydration with a moisture-locking layer appropriate for your skin type.',
    isAvyoraProduct: true
  });

  // 7. PROTECT
  steps.push({
    order: 7, category: 'protect', label: '07 — PROTECT', slotName: 'Protect',
    productId: 'relief-sun-cream', productName: 'Probiotics Relief Sun Cream',
    explanation: 'Finish with SPF 50+ to protect your collagen and prevent pigmentation.',
    isAvyoraProduct: true
  });

  return steps;
}

function buildFixed7StepEvening(p: SkinProfile, retinol: boolean, freq: string): RoutineStep[] {
  const steps: RoutineStep[] = [];
  const isOily = p.skinType === 'oily';
  const isDry = p.skinType === 'dry';

  // 1. FIRST CLEANSE
  steps.push({
    order: 1, category: 'cleanse', label: '01 — FIRST CLEANSE', slotName: 'First Cleanse',
    productId: 'rice-bran-cleansing-oil', productName: 'Rice Bran Cleansing Oil',
    explanation: 'Double cleansing starts with a high-slip oil to melt waterproof SPF and sebum.',
    isAvyoraProduct: true
  });

  // 2. SECOND CLEANSE
  steps.push({
    order: 2, category: 'cleanse', label: '02 — SECOND CLEANSE', slotName: 'Second Cleanse',
    productId: 'amino-acid-gel-cleanser', productName: 'Amino Acid Gel Cleanser',
    explanation: 'Follow with a water-based gel to wash away remaining water-based impurities.',
    isAvyoraProduct: true
  });

  // 3. EXFOLIATE
  steps.push({
    order: 3, category: 'exfoliate', label: '03 — EXFOLIATE', slotName: 'Exfoliate',
    productId: isOily ? 'lha-sebum-control' : 'pha-refining-fluid', productName: isOily ? 'LHA Sebum-Control' : 'PHA Refining Fluid',
    explanation: 'Scheduled chemical exfoliation keeps the surface smooth and reflective.',
    isAvyoraProduct: true
  });

  // 4. TONE
  steps.push({
    order: 4, category: 'tone', label: '04 — TONE', slotName: 'Tone',
    productId: isDry ? 'rice-toner' : 'ha-toner', productName: isDry ? 'Milky Rice Toner' : 'Multi-Molecular HA Toner',
    isAvyoraProduct: true, explanation: 'Prepare the skin for overnight repair layers.'
  });

  // 5. TREAT
  if (retinol) {
    steps.push({
      order: 5, category: 'renew', label: '05 — TREAT', slotName: 'Treat',
      productId: p.routineLevel >= 7 ? 'retinal-ampoule' : 'retinol', productName: p.routineLevel >= 7 ? 'Encapsulated Retinal' : 'Avyora Retinol',
      frequency: freq, explanation: 'Apply Vitamin A to signal cellular turnover and boost collagen production.',
      isAvyoraProduct: true
    });
  } else {
    steps.push({
      order: 5, category: 'treatment', label: '05 — TREAT', slotName: 'Treat',
      productId: 'snail-essence', productName: 'Advanced Snail Mucin Essence',
      explanation: 'A repairing essence to heal tissue and build a bouncy, resilient texture.',
      isAvyoraProduct: true
    });
  }

  // 6. EYE CARE
  steps.push({
    order: 6, category: 'eye', label: '06 — EYE CARE', slotName: 'Eye Care',
    productId: 'eye-patches', productName: 'Eye Patches (Optional PM)',
    isAvyoraProduct: true, explanation: 'Gentle hydration for the delicate eye area.'
  });

  // 7. MOISTURIZE
  steps.push({
    order: 7, category: 'hydrate', label: '07 — MOISTURIZE', slotName: 'Moisturize',
    productId: 'ceramide-cream', productName: '5x Essential Ceramide Cream',
    explanation: 'Overnight moisture lock is vital to prevent trans-epidermal water loss.',
    isAvyoraProduct: true
  });

  return steps;
}

function buildBodyRoutine(p: SkinProfile): RoutineStep[] {
  if (!p.bodyCare) return [];
  return [{
    order: 1, category: 'body', label: 'BODY CARE', slotName: 'Body care',
    productId: 'body-lotion', productName: 'Avyora Body Lotion',
    explanation: 'Apply to damp skin after bathing to lock in moisture.',
    isAvyoraProduct: true
  }];
}

function mapProductSizes(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[], p: SkinProfile) {
  const all = [...am, ...pm, ...body];
  const unique = new Map<string, string>();
  all.forEach(s => {
    if (s.isAvyoraProduct && s.productId) {
      let size = s.productSize || '30ml';
      if (s.productId === 'vitamin-c-serum' && p.routineLevel === 5) size = '10ml';
      if (s.productId === 'retinol' && p.routineLevel >= 7) size = '90ml';
      unique.set(s.productId, size);
    }
  });
  return Array.from(unique.entries()).map(([productId, size]) => ({ productId, size }));
}

function getExperienceName(exp: ExperienceLevel) {
  const map = { 'N0': 'MINIMAL', 'N1': 'BEGINNER', 'N2': 'REGULAR', 'N3': 'SERIOUS', 'N4': 'ADVANCED' };
  return map[exp] || 'PERSONAL';
}

function getMorningTitle(p: SkinProfile) {
  if (p.primaryConcern.includes('Dullness')) return "Brighten & Glow";
  return "Protect & Prep";
}

function getEveningTitle(p: SkinProfile) {
  if (p.primaryConcern.includes('Aging')) return "Renew & Repair";
  return "Recover & Hydrate";
}

function getUnderEyeGuidance(p: SkinProfile) {
  if (p.darkCircles === 'no') return undefined;
  return "Your answers indicate an under-eye concern. We have included our Caffeine Eye Patches to help drain puffiness and plump fine lines.";
}

function getWarnings(p: SkinProfile, ret: boolean) {
  const w = [];
  if (p.reactivity === 'high') w.push("Your skin is reactive. Introduce only 1 new SKU at a time.");
  if (ret) w.push("Retinol/Retinal increases sun sensitivity. Daily SPF is mandatory.");
  return w;
}

function getPriorities(p: SkinProfile) {
  const prio = [];
  if (p.primaryConcern.includes('Acne')) prio.push("01 — CLEARING PORES");
  else prio.push("01 — BARRIER HEALTH");
  prio.push("02 — CELLULAR REPAIR");
  prio.push("03 — UV DEFENSE");
  return prio;
}

function generateWhyThisRoutine(p: SkinProfile, vitC: boolean, ret: boolean) {
  return `You selected ${p.primaryConcern.toLowerCase()}, and have ${p.skinType} skin. We've built a full 7-phase routine utilizing our clinical ferment essences and targeted actives to achieve a translucent, healthy finish.`;
}

function getRetinolSchedule(p: SkinProfile) {
  return "Week 1: 1 night/week. Week 2-3: 2 nights/week. Week 4+: Increase as tolerated.";
}
