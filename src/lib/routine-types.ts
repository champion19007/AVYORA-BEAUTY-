export type ExperienceLevel = 'N0' | 'N1' | 'N2' | 'N3' | 'N4';

export type SkinProfile = {
  primaryConcern: string;
  secondaryConcerns: string[];
  skinType: string;
  reactivity: string;
  ageRange: string;
  sunExposure: string;
  experienceLevel: ExperienceLevel;
  consistency: string;
  currentCondition: string;
  darkCircles: string;
  darkSpots: string;
  bodyCare: boolean;
};

export type RoutineStep = {
  order: number;
  category: 'cleanse' | 'treatment' | 'hydrate' | 'protect' | 'body';
  label: string;
  productId?: string;
  productSize?: string;
  frequency?: string;
  explanation: string;
  isAvyoraProduct: boolean;
};

export type RecommendationResult = {
  profile: SkinProfile;
  experienceLevel: string;
  priorityConcerns: string[];
  morningRoutine: RoutineStep[];
  eveningRoutine: RoutineStep[];
  bodyRoutine: RoutineStep[];
  treatmentSchedule?: {
    vitaminC?: string;
    retinol?: string;
  };
  warnings: string[];
  explanations: string[];
  recommendedProducts: {
    productId: string;
    size: string;
  }[];
};
