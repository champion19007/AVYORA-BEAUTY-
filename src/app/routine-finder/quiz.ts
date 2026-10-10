import { INGREDIENTS } from '@/modules/ingredients/dictionary';
import { skinProfileV2Schema, type ConcernId, type SkinProfileV2 } from '@/modules/personalization/contracts';

/**
 * The routine finder's questions and how answers become a `SkinProfileV2`.
 *
 * Safety questions offer "prefer not to say" or "not sure", and can be
 * skipped; all three are kept as `unknown`, never read as "no". Experience,
 * routine size, budget and owned products are separate, required steps.
 * Pure: shared by the page and its tests.
 */

export type OwnedDraft = {
  id: string;
  label: string;
  role: 'cleanse' | 'moisturise' | 'protect' | 'other';
  prescribed: boolean;
};

export type Answers = {
  priorities?: ConcernId[];
  skinType?: SkinProfileV2['skinType'];
  reactivity?: SkinProfileV2['reactivity'];
  currentlyIrritated?: SkinProfileV2['currentlyIrritated'];
  ageBand?: SkinProfileV2['ageBand'];
  pregnancy?: SkinProfileV2['pregnancy'];
  nursing?: SkinProfileV2['nursing'];
  allergyHistory?: SkinProfileV2['allergyHistory'];
  /** Ingredient ids, or the single value `unlisted` when the allergen is not in our dictionary. */
  allergens?: string[];
  prescribedTreatment?: SkinProfileV2['prescribedTreatment'];
  experience?: SkinProfileV2['experience'];
  adherence?: SkinProfileV2['adherence'];
  maxDailySteps?: SkinProfileV2['maxDailySteps'];
  budgetRupees?: number;
  ownedItems?: OwnedDraft[];
};

type Option = { value: string; label: string };
export type Question =
  | { id: keyof Answers; kind: 'single'; label: string; help?: string; options: Option[]; skippable: boolean }
  | { id: 'priorities'; kind: 'priorities'; label: string; help: string; options: Option[] }
  | { id: 'allergens'; kind: 'allergens'; label: string; help: string }
  | { id: 'budgetRupees'; kind: 'budget'; label: string; help: string }
  | { id: 'ownedItems'; kind: 'owned'; label: string; help: string };

const TRI_PRIVATE: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Prefer not to say' },
];
const TRI_UNSURE: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not sure' },
];

/** Labels in plain words; the clinician-reviewed nomenclature is still to come (spec section 12). */
export const PRIORITY_LABELS: Record<ConcernId, string> = {
  blemish_appearance: 'Breakouts and blemishes',
  uneven_tone: 'Uneven tone or dark spots',
  dryness_reported: 'Dryness',
  shine_appearance: 'Shine or oiliness',
  fine_line_appearance: 'Fine lines',
};

export const MAX_BUDGET_RUPEES = 10_000;
export const UNLISTED_ALLERGEN = 'unlisted';
export const ALLERGEN_OPTIONS = [...INGREDIENTS]
  .map((i) => ({ value: i.id, label: i.common }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const QUESTIONS: Question[] = [
  {
    id: 'priorities',
    kind: 'priorities',
    label: 'What would you most like your routine to help with?',
    help: 'Choose up to three, most important first. Choose none for a simple essentials routine.',
    options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    id: 'skinType',
    kind: 'single',
    label: 'How would you describe your skin?',
    skippable: true,
    options: [
      { value: 'oily', label: 'Oily' },
      { value: 'dry', label: 'Dry' },
      { value: 'combination', label: 'Combination' },
      { value: 'normal', label: 'Normal' },
      { value: 'unknown', label: 'Not sure' },
    ],
  },
  {
    id: 'reactivity',
    kind: 'single',
    label: 'How easily does your skin react to new products?',
    skippable: true,
    options: [
      { value: 'low', label: 'Rarely' },
      { value: 'medium', label: 'Sometimes' },
      { value: 'high', label: 'Easily' },
      { value: 'very_high', label: 'Very easily' },
      { value: 'unknown', label: 'Not sure' },
    ],
  },
  {
    id: 'currentlyIrritated',
    kind: 'single',
    label: 'Is your skin irritated, broken or sore right now?',
    skippable: true,
    options: TRI_UNSURE,
  },
  {
    id: 'ageBand',
    kind: 'single',
    label: 'Are you 18 or older?',
    help: 'Some products are only suggested for adults.',
    skippable: true,
    options: [
      { value: 'adult', label: '18 or older' },
      { value: 'under18', label: 'Under 18' },
      { value: 'unknown', label: 'Prefer not to say' },
    ],
  },
  {
    id: 'pregnancy',
    kind: 'single',
    label: 'Are you pregnant or trying to become pregnant?',
    help: 'Only a "No" lets us suggest some treatments. Skipping keeps them out.',
    skippable: true,
    options: TRI_PRIVATE,
  },
  { id: 'nursing', kind: 'single', label: 'Are you breastfeeding?', skippable: true, options: TRI_PRIVATE },
  {
    id: 'allergyHistory',
    kind: 'single',
    label: 'Have you had an allergic reaction to a skincare ingredient?',
    skippable: true,
    options: TRI_UNSURE,
  },
  {
    id: 'allergens',
    kind: 'allergens',
    label: 'Which ingredients?',
    help: 'We can only check the ingredients listed here, and only in products whose full formulation we have verified.',
  },
  {
    id: 'prescribedTreatment',
    kind: 'single',
    label: 'Are you using a skin treatment prescribed by a doctor?',
    skippable: true,
    options: TRI_UNSURE,
  },
  {
    id: 'experience',
    kind: 'single',
    label: 'How much experience do you have with skincare routines?',
    skippable: false,
    options: [
      { value: 'new', label: 'New to it' },
      { value: 'some', label: 'Some' },
      { value: 'experienced', label: 'Experienced' },
    ],
  },
  {
    id: 'adherence',
    kind: 'single',
    label: 'How regularly do you expect to follow a routine?',
    skippable: false,
    options: [
      { value: 'low', label: 'Now and then' },
      { value: 'medium', label: 'Most days' },
      { value: 'high', label: 'Every day' },
    ],
  },
  {
    id: 'maxDailySteps',
    kind: 'single',
    label: 'How many steps would you like, morning and evening?',
    help: 'Fewer steps are easier to keep up.',
    skippable: false,
    options: [
      { value: '3', label: 'Up to 3: simple' },
      { value: '4', label: 'Up to 4: balanced' },
      { value: '5', label: 'Up to 5: fuller' },
    ],
  },
  {
    id: 'budgetRupees',
    kind: 'budget',
    label: 'What would you like to spend on new products?',
    help: 'Enter 0 to build a routine only from products you already have.',
  },
  {
    id: 'ownedItems',
    kind: 'owned',
    label: 'Which products do you already use?',
    help: 'We prefer what you already own. We cannot see their ingredients, so we keep new active treatments out while they are in your routine.',
  },
];

/** The questions that apply to these answers, in order (the allergen list only after a "Yes"). */
export function activeQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => q.id !== 'allergens' || answers.allergyHistory === 'yes');
}

/** Whether a question has an answer that lets the customer continue. */
export function isAnswered(q: Question, answers: Answers): boolean {
  if (q.kind === 'priorities' || q.kind === 'owned') return true;
  if (q.kind === 'allergens') return (answers.allergens?.length ?? 0) > 0;
  if (q.kind === 'budget') return budgetProblem(answers.budgetRupees) === null;
  return answers[q.id] !== undefined;
}

export function budgetProblem(value: number | undefined): string | null {
  if (value === undefined || Number.isNaN(value)) return 'Enter an amount in rupees, or 0.';
  if (!Number.isInteger(value)) return 'Use whole rupees.';
  if (value < 0 || value > MAX_BUDGET_RUPEES)
    return `Enter an amount from 0 to ${MAX_BUDGET_RUPEES.toLocaleString('en-IN')}.`;
  return null;
}

/**
 * A validated profile, or the first missing required answer. Unanswered
 * safety questions become `unknown`. An allergen we cannot name means no
 * listed ingredient can be ruled out, so the allergy stays unspecified.
 */
export function toProfile(
  answers: Answers
): { ok: true; profile: SkinProfileV2 } | { ok: false; missing: keyof Answers } {
  for (const id of ['experience', 'adherence', 'maxDailySteps', 'budgetRupees'] as const) {
    if (id === 'budgetRupees' ? budgetProblem(answers.budgetRupees) !== null : answers[id] === undefined)
      return { ok: false, missing: id };
  }
  const allergyHistory = answers.allergyHistory ?? 'unknown';
  const allergens = allergyHistory === 'yes' ? (answers.allergens ?? []) : [];
  const profile = skinProfileV2Schema.parse({
    schemaVersion: 2,
    ageBand: answers.ageBand ?? 'unknown',
    skinType: answers.skinType ?? 'unknown',
    reactivity: answers.reactivity ?? 'unknown',
    pregnancy: answers.pregnancy ?? 'unknown',
    nursing: answers.nursing ?? 'unknown',
    currentlyIrritated: answers.currentlyIrritated ?? 'unknown',
    allergyHistory,
    prescribedTreatment: answers.prescribedTreatment ?? 'unknown',
    priorities: (answers.priorities ?? []).slice(0, 3),
    budgetPaise: answers.budgetRupees! * 100,
    maxDailySteps: Number(answers.maxDailySteps),
    experience: answers.experience,
    adherence: answers.adherence,
    allergyIngredientIds: allergens.includes(UNLISTED_ALLERGEN) ? [] : allergens,
    preferences: { eyeCare: false, bodyCare: false },
    ownedItems: (answers.ownedItems ?? [])
      .filter((o) => o.label.trim())
      .map((o) => ({
        id: o.id,
        label: o.label.trim().slice(0, 80),
        ingredientIds: [],
        coverage: 'unknown',
        prescribed: o.prescribed,
        role: o.role,
      })),
  });
  return { ok: true, profile };
}
