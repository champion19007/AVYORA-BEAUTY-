import { SkinProfile, RecommendationResult, RoutineStep, ExperienceLevel, ReactivityLevel } from './routine-types';
import { PRODUCTS } from '@/data/mock-data';

export function getRecommendation(answers: any): RecommendationResult {
  const profile: SkinProfile = {
    primaryConcern: answers.concern,
    secondaryConcerns: answers.secondaryConcerns || [],
    skinType: answers.skinType as any,
    reactivity: mapReactivity(answers.reactivity),
    ageRange: answers.age as any,
    sunExposure: answers.sun as any,
    experienceLevel: mapExperience(answers.experience),
    consistency: answers.consistency,
    currentCondition: answers.currentCondition,
    darkCircles: answers.darkCircles as any,
    darkSpots: answers.darkSpots as any,
    bodyCare: answers.bodyCare === 'yes',
  };

  // 1. Actives Eligibility
  const vitCResult = evaluateVitaminC(profile);
  const retinolResult = evaluateRetinol(profile);

  // 2. Frequencies
  const vitCFreq = getVitCFrequency(profile, vitCResult.eligible);
  const retinolFreq = getRetinolFrequency(profile, retinolResult.eligible);
  
  // 3. Build AM Routine (Fixed Order)
  const morningRoutine: RoutineStep[] = [];
  morningRoutine.push({ order: 1, category: 'cleanse', label: 'CLEANSE', productId: 'face-wash', productName: 'Avyora Face Wash', productSize: '100ml', explanation: 'pH-balanced essential cleanse.', isAvyoraProduct: true });
  
  if (vitCResult.eligible && vitCFreq !== 'Defer') {
    const size = (profile.experienceLevel === 'N0' || profile.experienceLevel === 'N1') ? '10ml' : '30ml';
    morningRoutine.push({ order: 2, category: 'treatment', label: 'BRIGHTEN', productId: 'vitamin-c-serum', productName: 'Avyora Vitamin C Serum', productSize: size, frequency: vitCFreq, explanation: 'Antioxidant support for tone and glow.', isAvyoraProduct: true });
  }

  morningRoutine.push({ order: 3, category: 'hydrate', label: 'HYDRATE', productName: 'Facial Moisturizer', explanation: 'Helps maintain hydration and support the skin barrier.', isAvyoraProduct: false });
  
  const sunSize = (profile.experienceLevel === 'N0' || profile.experienceLevel === 'N1') ? '30ml' : '50ml';
  morningRoutine.push({ order: 4, category: 'protect', label: 'PROTECT', productId: 'sunscreen', productName: 'Avyora Sunscreen', productSize: sunSize, explanation: 'Mandatory daily protection against UVA/UVB.', isAvyoraProduct: true });

  // 4. Build PM Routine (Fixed Order)
  const eveningRoutine: RoutineStep[] = [];
  eveningRoutine.push({ order: 1, category: 'cleanse', label: 'CLEANSE', productId: 'face-wash', productName: 'Avyora Face Wash', productSize: '100ml', explanation: 'Removes daily buildup and pollution.', isAvyoraProduct: true });

  if (retinolResult.eligible && retinolFreq !== 'Usually defer' && retinolFreq !== 'Defer') {
    const size = (profile.experienceLevel === 'N3' || profile.experienceLevel === 'N4') ? '90ml' : '30ml';
    eveningRoutine.push({ order: 2, category: 'treatment', label: 'TREAT', productId: 'retinol', productName: 'Avyora Retinol', productSize: size, frequency: retinolFreq, explanation: 'Clinically targets aging, fine lines, and texture.', isAvyoraProduct: true });
  }

  eveningRoutine.push({ order: 3, category: 'hydrate', label: 'HYDRATE', productName: 'Facial Moisturizer', explanation: 'Nighttime barrier recovery and nourishment.', isAvyoraProduct: false });

  // 5. Build Body Routine
  const bodyRoutine: RoutineStep[] = [];
  if (profile.bodyCare) {
    bodyRoutine.push({ order: 1, category: 'body', label: 'BODY CARE', productId: 'body-lotion', productName: 'Avyora Body Lotion', productSize: '180ml', explanation: 'Deep hydration for body skin. Use after showering.', isAvyoraProduct: true });
  }

  // 6. Final Recommendation
  return {
    profile,
    experienceLevel: profile.experienceLevel,
    priorityConcerns: getPriorityConcerns(profile),
    morningRoutine,
    eveningRoutine,
    bodyRoutine,
    underEyeGuidance: profile.darkCircles !== 'no' ? 'Your answers indicate an under-eye concern. Maintain gentle hydration and daily sun protection; a dedicated eye-care product may be considered separately.' : undefined,
    warnings: getWarnings(profile, retinolResult.eligible),
    explanations: getExplanations(profile, vitCResult.eligible, retinolResult.eligible),
    recommendedProducts: getProductMapping(morningRoutine, eveningRoutine, bodyRoutine),
    treatmentSchedule: {
      retinol: retinolResult.eligible ? getRetinolSchedule(profile.experienceLevel, profile.reactivity) : undefined,
    }
  };
}

function mapExperience(val: string): ExperienceLevel {
  const map: Record<string, ExperienceLevel> = {
    'none': 'N0',
    'beginner': 'N1',
    'basic': 'N2',
    'regular': 'N2',
    'serious': 'N3',
    'experienced': 'N4',
  };
  return map[val] || 'N0';
}

function mapReactivity(val: string): ReactivityLevel {
  const map: Record<string, ReactivityLevel> = {
    'rarely': 'low',
    'sometimes': 'medium',
    'easily': 'high',
    'very': 'very_high',
  };
  return map[val] || 'low';
}

function evaluateVitaminC(p: SkinProfile): { eligible: boolean } {
  const qualifyingConcerns = ['pigmentation', 'dullness', 'uneven', 'tanning'];
  const hasQualifying = qualifyingConcerns.includes(p.primaryConcern) || 
                       p.secondaryConcerns.some(c => qualifyingConcerns.includes(c)) ||
                       p.darkSpots !== 'no' ||
                       p.primaryConcern === 'Dark Spots & Pigmentation' ||
                       p.primaryConcern === 'Dullness & Uneven Tone' ||
                       p.primaryConcern === 'Tanning';

  if (p.reactivity === 'very_high' || p.experienceLevel === 'N0') return { eligible: false };
  return { eligible: hasQualifying };
}

function evaluateRetinol(p: SkinProfile): { eligible: boolean } {
  // Hard exclusions
  if (p.ageRange === 'under18') return { eligible: false };
  if (p.reactivity === 'very_high') return { eligible: false };
  if (p.currentCondition === 'irritated') return { eligible: false };
  if (p.experienceLevel === 'N0' && p.primaryConcern === 'simple') return { eligible: false };
  
  const qualifyingConcerns = ['lines', 'aging', 'texture', 'Fine Lines & Aging', 'Texture & Roughness'];
  const hasQualifying = qualifyingConcerns.includes(p.primaryConcern) || 
                       p.secondaryConcerns.some(c => qualifyingConcerns.includes(c)) ||
                       p.darkSpots !== 'no';

  if (!hasQualifying) return { eligible: false };

  // Age/Experience modifiers
  if (p.ageRange === '18_24' && p.experienceLevel !== 'N4') return { eligible: false };

  return { eligible: true };
}

function getVitCFrequency(p: SkinProfile, eligible: boolean): string {
  if (!eligible) return 'None';
  if (p.reactivity === 'very_high') return 'Defer';

  let level = p.experienceLevel;
  if (p.reactivity === 'high') {
    // Reduce one level
    const levels: ExperienceLevel[] = ['N0', 'N1', 'N2', 'N3', 'N4'];
    const idx = levels.indexOf(level);
    level = levels[Math.max(0, idx - 1)];
  }

  const map: Record<ExperienceLevel, string> = {
    'N0': 'Defer',
    'N1': '2-3 mornings/week',
    'N2': '3-5 mornings/week',
    'N3': 'Daily AM if tolerated',
    'N4': 'Daily AM if tolerated',
  };
  return map[level];
}

function getRetinolFrequency(p: SkinProfile, eligible: boolean): string {
  if (!eligible) return 'None';
  if (p.reactivity === 'very_high') return 'Defer';

  const isSensitive = p.reactivity === 'high' || p.skinType === 'sensitive';
  
  if (isSensitive) {
    const map: Record<ExperienceLevel, string> = {
      'N0': 'Usually defer',
      'N1': 'Usually defer',
      'N2': '1-2 nights/week',
      'N3': '2-3 nights/week',
      'N4': '2-3 nights/week',
    };
    return map[p.experienceLevel];
  } else {
    const map: Record<ExperienceLevel, string> = {
      'N0': 'Usually defer',
      'N1': '1-2 nights/week',
      'N2': '2-3 nights/week',
      'N3': '3-4 nights/week',
      'N4': '3-5 nights/week',
    };
    return map[p.experienceLevel];
  }
}

function getRetinolSchedule(exp: ExperienceLevel, react: ReactivityLevel): string {
  const base = "Week 1-2: 2 nights/week. Week 3-4: 3 nights/week if tolerated. Ongoing: Increase gradually.";
  if (exp === 'N1') return "Week 1-4: 1-2 nights/week. Very gradual introduction required.";
  if (react === 'high') return "Start with 1 night per week. Increase only if skin shows no signs of redness or peeling.";
  return base;
}

function getPriorityConcerns(p: SkinProfile): string[] {
  const list = [
    { p: 1, c: 'Irritation / Sensitivity', active: p.reactivity === 'very_high' || p.currentCondition === 'irritated' },
    { p: 2, c: 'Acne & Breakouts', active: p.primaryConcern.includes('Acne') },
    { p: 3, c: 'Dark Spots & Pigmentation', active: p.darkSpots !== 'no' || p.primaryConcern.includes('Dark Spots') },
    { p: 4, c: 'Fine Lines & Aging', active: p.primaryConcern.includes('Aging') },
    { p: 5, c: 'Texture', active: p.primaryConcern.includes('Texture') },
    { p: 6, c: 'Dullness', active: p.primaryConcern.includes('Dullness') },
    { p: 7, c: 'Tanning', active: p.secondaryConcerns.includes('tanning') },
    { p: 8, c: 'Dryness', active: p.primaryConcern.includes('Dryness') || p.skinType === 'dry' },
    { p: 9, c: 'Maintenance', active: true },
  ];
  return list.filter(item => item.active).sort((a, b) => a.p - b.p).map(item => item.c.toUpperCase()).slice(0, 3);
}

function getWarnings(p: SkinProfile, hasRetinol: boolean): string[] {
  const warnings = [];
  if (p.reactivity === 'high' || p.reactivity === 'very_high') warnings.push("Your skin is highly reactive. Introduce only one new product at a time and patch test.");
  if (p.currentCondition === 'irritated') warnings.push("Your skin is currently irritated. Focus on a simple Cleanse + Hydrate routine until barrier recovers.");
  if (hasRetinol) warnings.push("Retinol increases sun sensitivity. Daily high-SPF sunscreen is mandatory.");
  return warnings;
}

function getExplanations(p: SkinProfile, vC: boolean, retinol: boolean): string[] {
  const exps = [`Routine optimized for ${p.skinType} skin with a focus on ${p.primaryConcern}.`];
  if (vC && retinol) exps.push("Vitamin C is placed in your morning routine and Retinol in your evening routine so the actives are separated across the day.");
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
