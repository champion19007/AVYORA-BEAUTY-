export type ExperienceLevel = 'N0' | 'N1' | 'N2' | 'N3' | 'N4';
export type ReactivityLevel = 'low' | 'medium' | 'high' | 'very_high';
export type RoutineLevel = 4 | 5 | 6 | 7;
/** "Prefer not to say", and no answer at all, are `unknown` — never `no`. */
export type TriState = 'yes' | 'no' | 'unknown';

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
  /** Pregnant or breastfeeding. Only `no` establishes retinoid eligibility. */
  pregnancy: TriState;
};

export type RoutineStep = {
  order: number;
  category:
    | 'cleanse'
    | 'treatment'
    | 'brighten'
    | 'hydrate'
    | 'protect'
    | 'body'
    | 'renew'
    | 'tone'
    | 'essence'
    | 'eye'
    | 'exfoliate';
  label: string;
  slotName: string;
  productId?: string;
  productName?: string;
  productSize?: string;
  frequency?: string;
  explanation: string;
  isAvyoraProduct: boolean;
  isPlaceholder?: boolean;
  /** An addition the customer may choose, not part of the essential routine. */
  optional?: boolean;
};

/**
 * - `recovery`: skin is irritated now; essentials only, no actives.
 * - `gentle`: very reactive skin; essentials only, no actives.
 * - `essentials`: a beginner, or no eligible treatment; cleanse, moisturise, protect.
 * - `treatment`: essentials plus at least one approved treatment.
 */
export type RoutineMode = 'recovery' | 'gentle' | 'essentials' | 'treatment';

/** Why a treatment that might have suited the customer is not in the routine. */
export type OmittedTreatment = {
  productId: string;
  reason:
    | 'irritated'
    | 'very_reactive'
    | 'beginner'
    | 'pregnancy_yes'
    | 'pregnancy_unknown'
    | 'under18'
    | 'directions_pending'
    | 'formulation_incomplete'
    | 'treatment_limit';
};

export type RecommendationResult = {
  profile: SkinProfile;
  mode: RoutineMode;
  experienceLevelName: string;
  morningTitle: string;
  eveningTitle: string;
  /** The essential routine, plus any approved treatments. */
  morningRoutine: RoutineStep[];
  eveningRoutine: RoutineStep[];
  /** Explicitly optional additions, kept apart from the essential routine. */
  optionalSteps: RoutineStep[];
  bodyRoutine: RoutineStep[];
  underEyeGuidance?: string;
  omitted: OmittedTreatment[];
  warnings: string[];
  explanations: string[];
  priorities: string[];
  whyThisRoutine: string;
  recommendedProducts: {
    productId: string;
    size: string;
    optional: boolean;
  }[];
};
