export type ExperienceLevel = 'N0' | 'N1' | 'N2' | 'N3' | 'N4';
export type ReactivityLevel = 'low' | 'medium' | 'high' | 'very_high';
export type RoutineLevel = 4 | 5 | 6 | 7;

export type SkinProfile = {
  primaryConcern: string;
  secondaryConcerns: string[];
  skinType: 'oily' | 'dry' | 'combination' | 'normal' | 'sensitive';
  reactivity: ReactivityLevel;
  ageRange: 'under18' | '18_24' | '25_34' | '35_44' | '45_plus';
  sunExposure: 'indoors' | 'moderate' | 'outdoors' | 'high';
  experienceLevel: ExperienceLevel;
  routineLevel: RoutineLevel;
  consistency: string;
  currentCondition: string;
  darkCircles: 'no' | 'mild' | 'noticeable' | 'significant';
  darkSpots: 'no' | 'few' | 'moderate' | 'significant';
  bodyCare: boolean;
};

export type RoutineStep = {
  order: number;
  category: 'cleanse' | 'treatment' | 'brighten' | 'hydrate' | 'protect' | 'body';
  label: string;
  productId?: string;
  productName?: string;
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
  underEyeGuidance?: string;
  treatmentSchedule?: {
    retinol?: string;
  };
  warnings: string[];
  explanations: string[];
  recommendedProducts: {
    productId: string;
    size: string;
  }[];
};
