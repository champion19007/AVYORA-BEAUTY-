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
  /** Retinoids are withheld during pregnancy and breastfeeding. */
  pregnancy: boolean;
};

export type RoutineStep = {
  order: number;
  category: 'cleanse' | 'treatment' | 'brighten' | 'hydrate' | 'protect' | 'body' | 'renew' | 'tone' | 'essence' | 'eye' | 'exfoliate';
  label: string;
  slotName: string;
  productId?: string;
  productName?: string;
  productSize?: string;
  frequency?: string;
  explanation: string;
  isAvyoraProduct: boolean;
  isPlaceholder?: boolean;
};

export type RecommendationResult = {
  profile: SkinProfile;
  experienceLevelName: string;
  morningTitle: string;
  eveningTitle: string;
  morningRoutine: RoutineStep[];
  eveningRoutine: RoutineStep[];
  bodyRoutine: RoutineStep[];
  underEyeGuidance?: string;
  treatmentSchedule?: {
    retinol?: string;
  };
  warnings: string[];
  explanations: string[];
  priorities: string[];
  whyThisRoutine: string;
  recommendedProducts: {
    productId: string;
    size: string;
  }[];
};
