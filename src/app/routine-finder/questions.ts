/** The routine finder's questions, shared by the page and its tests. */
export type Question = {
  id: string;
  label: string;
  help?: string;
  multi?: boolean;
  options: { value: string; label: string }[];
};

export const QUESTIONS: Question[] = [
  {
    id: 'concern',
    label: 'WHAT IS YOUR PRIMARY CONCERN?',
    options: [
      { value: 'Acne & Breakouts', label: 'Acne & Breakouts' },
      { value: 'Dark Spots & Pigmentation', label: 'Dark Spots & Pigmentation' },
      { value: 'Dullness & Uneven Tone', label: 'Dullness & Uneven Tone' },
      { value: 'Fine Lines & Aging', label: 'Fine Lines & Aging' },
      { value: 'Texture & Roughness', label: 'Texture & Roughness' },
      { value: 'Dryness', label: 'Dryness' },
      { value: 'Just Want a Simple Routine', label: 'Just Want a Simple Routine' },
    ],
  },
  {
    id: 'secondaryConcerns',
    label: 'DO YOU HAVE ANY OTHER CONCERNS?',
    multi: true,
    options: [
      { value: 'Acne & Breakouts', label: 'Acne & Breakouts' },
      { value: 'Dark Spots', label: 'Dark Spots' },
      { value: 'Dullness', label: 'Dullness' },
      { value: 'Uneven Tone', label: 'Uneven Tone' },
      { value: 'Fine Lines', label: 'Fine Lines' },
      { value: 'Texture', label: 'Texture' },
      { value: 'Dryness', label: 'Dryness' },
      { value: 'Tanning', label: 'Tanning' },
      { value: 'Dark Circles', label: 'Dark Circles' },
      { value: 'Oiliness', label: 'Oiliness' },
      { value: 'None', label: 'None' },
    ],
  },
  {
    id: 'skinType',
    label: 'WHAT IS YOUR SKIN TYPE?',
    options: [
      { value: 'oily', label: 'Oily' },
      { value: 'dry', label: 'Dry' },
      { value: 'combination', label: 'Combination' },
      { value: 'normal', label: 'Normal' },
      { value: 'sensitive', label: 'Sensitive' },
    ],
  },
  {
    id: 'reactivity',
    label: 'HOW REACTIVE IS YOUR SKIN?',
    options: [
      { value: 'rarely', label: 'Rarely reacts to products' },
      { value: 'sometimes', label: 'Sometimes gets irritated' },
      { value: 'easily', label: 'Easily irritated' },
      { value: 'very_high', label: 'Very reactive / sensitive' },
    ],
  },
  {
    id: 'age',
    label: 'WHAT IS YOUR AGE?',
    options: [
      { value: 'under18', label: 'Under 18' },
      { value: '18_24', label: '18–24' },
      { value: '25_34', label: '25–34' },
      { value: '35_44', label: '35–44' },
      { value: '45_plus', label: '45+' },
    ],
  },
  {
    id: 'sun',
    label: 'HOW MUCH SUN EXPOSURE DO YOU GET?',
    options: [
      { value: 'indoors', label: 'Mostly indoors' },
      { value: 'moderate', label: 'Moderate outdoor exposure' },
      { value: 'outdoors', label: 'Outdoors often' },
      { value: 'high', label: 'High sun exposure' },
    ],
  },
  {
    id: 'experience',
    label: 'HOW EXPERIENCED ARE YOU WITH SKINCARE?',
    options: [
      { value: 'none', label: 'I have no routine' },
      { value: 'beginner', label: "I'm a beginner" },
      { value: 'basic', label: 'I follow a basic routine' },
      { value: 'regular', label: 'I follow skincare regularly' },
      { value: 'experienced', label: "I'm serious about skincare" },
    ],
  },
  {
    id: 'consistency',
    label: 'HOW CONSISTENT ARE YOU WITH SKINCARE?',
    options: [
      { value: 'rarely', label: 'I rarely follow a routine' },
      { value: 'few', label: 'A few days per week' },
      { value: 'most', label: 'Most days' },
      { value: 'every', label: 'Every day' },
    ],
  },
  {
    id: 'currentCondition',
    label: 'HOW WOULD YOU DESCRIBE YOUR SKIN RIGHT NOW?',
    options: [
      { value: 'clear', label: 'Mostly clear' },
      { value: 'occasional', label: 'Occasional breakouts' },
      { value: 'frequent', label: 'Frequent breakouts' },
      { value: 'pigmentation', label: 'Pigmentation / dark spots' },
      { value: 'dry', label: 'Very dry' },
      { value: 'texture', label: 'Rough / uneven texture' },
      { value: 'irritated', label: 'Irritated' },
      { value: 'multiple', label: 'Multiple concerns' },
    ],
  },
  {
    id: 'darkCircles',
    label: 'DO YOU HAVE DARK CIRCLES UNDER YOUR EYES?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'mild', label: 'Mild' },
      { value: 'noticeable', label: 'Noticeable' },
      { value: 'significant', label: 'Significant' },
    ],
  },
  {
    id: 'darkSpots',
    label: 'DO YOU HAVE DARK SPOTS OR PIGMENTATION?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'few', label: 'A few' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'significant', label: 'Significant' },
    ],
  },
  {
    // Three distinct answers. "Prefer not to say" used to share the value
    // `no`, which both made it count as "not pregnant" and showed both
    // buttons as selected. Unknown now stays unknown, and unknown never makes
    // a retinoid eligible.
    id: 'pregnancy',
    label: 'ARE YOU PREGNANT OR BREASTFEEDING?',
    help: 'Retinoids are left out of your routine if you are, or if you would rather not say.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'unknown', label: 'Prefer not to say' },
    ],
  },
  {
    id: 'bodyCare',
    label: 'DO YOU WANT BODY CARE INCLUDED?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
];
