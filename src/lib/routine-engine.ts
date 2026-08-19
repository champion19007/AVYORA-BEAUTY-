import { SkinProfile, RecommendationResult, RoutineStep, ExperienceLevel } from './routine-types';
import { PRODUCTS } from '@/data/mock-data';

export function getRecommendation(answers: any): RecommendationResult {
  const profile: SkinProfile = {
    primaryConcern: answers.concern,
    secondaryConcerns: answers.secondaryConcerns || [],
    skinType: answers.skinType,
    reactivity: answers.reactivity,
    ageRange: answers.age,
    sunExposure: answers.sun,
    experienceLevel: mapExperience(answers.experience),
    consistency: answers.consistency,
    currentCondition: answers.currentCondition,
    darkCircles: answers.darkCircles,
    darkSpots: answers.darkSpots,
    bodyCare: answers.bodyCare === 'yes',
  };

  const experience = profile.experienceLevel;
  const isSensitive = ['easily', 'very'].includes(profile.reactivity);
  const isIrritated = profile.currentCondition === 'irritated';

  // 1. Actives Scoring
  let vCScore = 0;
  if (profile.primaryConcern === 'dullness' || profile.secondaryConcerns.includes('dullness')) vCScore += 3;
  if (profile.primaryConcern === 'uneven' || profile.secondaryConcerns.includes('uneven')) vCScore += 4;
  if (profile.darkSpots !== 'no') vCScore += 4;
  if (profile.primaryConcern === 'tanning' || profile.secondaryConcerns.includes('tanning')) vCScore += 3;
  if (profile.sunExposure === 'high' || profile.sunExposure === 'outdoors') vCScore += 1;
  if (experience === 'N3' || experience === 'N4') vCScore += 1;

  let rScore = 0;
  if (profile.primaryConcern === 'aging' || profile.secondaryConcerns.includes('aging')) rScore += 5;
  if (profile.primaryConcern === 'lines' || profile.secondaryConcerns.includes('lines')) rScore += 5;
  if (profile.primaryConcern === 'texture' || profile.secondaryConcerns.includes('texture')) rScore += 3;
  if (profile.currentCondition === 'pigmentation') rScore += 3;
  if (['35-44', '45+'].includes(profile.ageRange)) rScore += 3;
  if (experience === 'N3' || experience === 'N4') rScore += 1;
  if (isSensitive) rScore -= 4;
  if (experience === 'N0' || experience === 'N1') rScore -= 2;

  // 2. Eligibility
  const recommendVitC = vCScore >= 4 && !isIrritated;
  const recommendRetinol = rScore >= 5 && !isIrritated && profile.ageRange !== 'under18' && !isSensitive;

  // 3. Frequency & Sizes
  const vitCFreq = getVitCFrequency(experience, isSensitive);
  const retinolFreq = getRetinolFrequency(experience, isSensitive);
  
  const vitCSize = (experience === 'N0' || experience === 'N1') ? '10ml' : '30ml';
  const retinolSize = (experience === 'N3' || experience === 'N4') ? '90ml' : '30ml';
  const sunscreenSize = (experience === 'N3' || experience === 'N4') ? '50ml' : '30ml';

  // 4. Build Routines
  const morningRoutine: RoutineStep[] = [
    { order: 1, category: 'cleanse', label: 'CLEANSE', productId: 'face-wash', productSize: '100ml', explanation: 'pH-balanced essential cleanse.', isAvyoraProduct: true },
  ];

  if (recommendVitC) {
    morningRoutine.push({ order: 2, category: 'treatment', label: 'BRIGHTEN', productId: 'vitamin-c-serum', productSize: vitCSize, frequency: vitCFreq, explanation: 'Antioxidant support for tone and glow.', isAvyoraProduct: true });
  }

  morningRoutine.push({ order: 3, category: 'hydrate', label: 'HYDRATE', explanation: 'Supports the skin barrier.', isAvyoraProduct: false });
  morningRoutine.push({ order: 4, category: 'protect', label: 'PROTECT', productId: 'sunscreen', productSize: sunscreenSize, explanation: 'Mandatory daily protection.', isAvyoraProduct: true });

  const eveningRoutine: RoutineStep[] = [
    { order: 1, category: 'cleanse', label: 'CLEANSE', productId: 'face-wash', productSize: '100ml', explanation: 'Removes daily buildup.', isAvyoraProduct: true },
  ];

  if (recommendRetinol) {
    eveningRoutine.push({ order: 2, category: 'treatment', label: 'TREAT', productId: 'retinol', productSize: retinolSize, frequency: retinolFreq, explanation: 'Clinically targets aging and texture.', isAvyoraProduct: true });
  }

  eveningRoutine.push({ order: 3, category: 'hydrate', label: 'HYDRATE', explanation: 'Nighttime barrier recovery.', isAvyoraProduct: false });

  // 5. Body & Additional Info
  const bodyRoutine: RoutineStep[] = [];
  if (profile.bodyCare) {
    bodyRoutine.push({ order: 1, category: 'body', label: 'BODY CARE', productId: 'body-lotion', productSize: '180ml', explanation: 'Deep hydration for body skin.', isAvyoraProduct: true });
  }

  const result: RecommendationResult = {
    profile,
    experienceLevel: experience,
    priorityConcerns: getPriorities(profile),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    warnings: getWarnings(profile, recommendRetinol),
    explanations: getExplanations(profile, recommendVitC, recommendRetinol),
    recommendedProducts: getProductMapping(morningRoutine, eveningRoutine, bodyRoutine),
    treatmentSchedule: {
      retinol: recommendRetinol ? getRetinolSchedule(experience, isSensitive) : undefined,
    }
  };

  return result;
}

function mapExperience(val: string): ExperienceLevel {
  const map: Record<string, ExperienceLevel> = {
    'none': 'N0',
    'beginner': 'N1',
    'basic': 'N2',
    'regular': 'N3',
    'experienced': 'N4',
  };
  return map[val] || 'N0';
}

function getVitCFrequency(exp: ExperienceLevel, sensitive: boolean): string {
  if (sensitive) return '2-3 Mornings / Week';
  if (exp === 'N0' || exp === 'N1') return '3-4 Mornings / Week';
  return 'Daily AM';
}

function getRetinolFrequency(exp: ExperienceLevel, sensitive: boolean): string {
  if (sensitive) return 'Deferred';
  if (exp === 'N1') return '1-2 Nights / Week';
  if (exp === 'N2') return '2-3 Nights / Week';
  if (exp === 'N3') return '3-4 Nights / Week';
  return '3-5 Nights / Week';
}

function getRetinolSchedule(exp: ExperienceLevel, sensitive: boolean): string {
  if (sensitive) return 'Not recommended for highly reactive skin.';
  const base = "Week 1-2: 2 nights/week. Week 3-4: 3 nights/week if tolerated. Ongoing: Increase gradually.";
  if (exp === 'N1') return "Week 1-4: 1-2 nights/week. Very gradual introduction required.";
  return base;
}

function getPriorities(p: SkinProfile): string[] {
  const priorities = ['SUN PROTECTION'];
  if (p.primaryConcern !== 'simple') priorities.unshift(p.primaryConcern.toUpperCase().replace(/-/g, ' '));
  if (p.darkSpots !== 'no') priorities.push('PIGMENTATION CONTROL');
  return priorities.slice(0, 3);
}

function getWarnings(p: SkinProfile, hasRetinol: boolean): string[] {
  const warnings = [];
  if (['easily', 'very'].includes(p.reactivity)) warnings.push("Your skin is reactive. Introduce one new product at a time.");
  if (p.currentCondition === 'irritated') warnings.push("Your skin is currently irritated. Focus on a simple Cleanse + Hydrate routine first.");
  if (hasRetinol) warnings.push("Retinol increases sun sensitivity. Daily sunscreen is mandatory.");
  return warnings;
}

function getExplanations(p: SkinProfile, vC: boolean, retinol: boolean): string[] {
  const exps = [`Routine built for ${p.skinType} skin with a focus on ${p.primaryConcern}.`];
  if (vC && retinol) exps.push("We separated Vitamin C (AM) and Retinol (PM) to prevent irritation and maximize efficacy.");
  if (p.darkCircles !== 'no') exps.push("For under-eye concerns, prioritize gentle hydration and daily UV protection.");
  return exps;
}

function getProductMapping(am: RoutineStep[], pm: RoutineStep[], body: RoutineStep[]): { productId: string; size: string }[] {
  const all = [...am, ...pm, ...body];
  const unique = new Map<string, string>();
  all.forEach(step => {
    if (step.isAvyoraProduct && step.productId) {
      unique.set(step.productId, step.productSize || '');
    }
  });
  return Array.from(unique.entries()).map(([id, size]) => ({ productId: id, size }));
}
