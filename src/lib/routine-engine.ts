export type RoutineAnswers = {
  concern: string;
  skinType: string;
  age: string;
  sun: string;
  experience: string;
  bodyCare: string;
};

export type RecommendedProduct = {
  productId: string;
  size: string;
  usage: 'AM' | 'PM' | 'Anytime';
  reason: string;
};

export function getRecommendation(answers: RoutineAnswers): RecommendedProduct[] {
  const recommendations: RecommendedProduct[] = [];
  const isAdvanced = answers.experience === 'advanced';

  // Face Wash: Always included
  recommendations.push({
    productId: 'face-wash',
    size: '100ml',
    usage: 'AM',
    reason: `Essential base for your ${answers.skinType} skin routine.`
  });

  // Vitamin C Logic
  const includeVitC = answers.concern === 'dullness' || answers.age === 'under25' || answers.age === '25-35';
  if (includeVitC) {
    recommendations.push({
      productId: 'vitamin-c-serum',
      size: isAdvanced ? '30ml' : '10ml',
      usage: 'AM',
      reason: answers.concern === 'dullness' 
        ? 'Targeted clinical brightening for uneven tone.' 
        : 'Preventative antioxidant support for your age group.'
    });
  }

  // Retinol Logic
  const includeRetinol = answers.concern === 'aging' || answers.age === '35plus';
  if (includeRetinol) {
    recommendations.push({
      productId: 'retinol',
      size: isAdvanced ? '50ml' : '30ml',
      usage: 'PM',
      reason: answers.concern === 'aging'
        ? 'High-potency renewal for targeted fine-line correction.'
        : 'Clinical skin cycle support for mature skin.'
    });
  }

  // Sunscreen: Always included
  recommendations.push({
    productId: 'sunscreen',
    size: isAdvanced ? '50ml' : '30ml',
    usage: 'AM',
    reason: answers.sun === 'outdoors' 
      ? 'Maximum protection for frequent sun exposure.'
      : 'Invisible daily shield for consistent dermal protection.'
  });

  // Body Lotion Logic
  if (answers.bodyCare === 'yes') {
    recommendations.push({
      productId: 'body-lotion',
      size: '180ml',
      usage: 'Anytime',
      reason: 'Deep hydration to complete your clinical body regimen.'
    });
  }

  return recommendations;
}