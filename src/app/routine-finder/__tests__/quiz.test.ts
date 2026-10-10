import { describe, expect, it } from 'vitest';
import {
  activeQuestions,
  budgetProblem,
  isAnswered,
  QUESTIONS,
  toProfile,
  UNLISTED_ALLERGEN,
  type Answers,
} from '../quiz';

const REQUIRED: Answers = { experience: 'new', adherence: 'medium', maxDailySteps: 3, budgetRupees: 1500 };

describe('answers to SkinProfileV2', () => {
  it('unanswered and skipped safety questions stay unknown, never "no"', () => {
    const r = toProfile({ ...REQUIRED, pregnancy: 'unknown' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({
      pregnancy: 'unknown',
      nursing: 'unknown',
      currentlyIrritated: 'unknown',
      ageBand: 'unknown',
      allergyHistory: 'unknown',
      prescribedTreatment: 'unknown',
      reactivity: 'unknown',
      skinType: 'unknown',
      budgetPaise: 150_000,
      maxDailySteps: 3,
      priorities: [],
    });
  });

  it('experience, routine size and budget are required and separate', () => {
    for (const missing of ['experience', 'adherence', 'maxDailySteps', 'budgetRupees'] as const) {
      expect(toProfile({ ...REQUIRED, [missing]: undefined })).toEqual({ ok: false, missing });
    }
  });

  it('an allergen we cannot name leaves the allergy unspecified, so nothing can be ruled safe', () => {
    const r = toProfile({ ...REQUIRED, allergyHistory: 'yes', allergens: ['niacinamide', UNLISTED_ALLERGEN] });
    expect(r.ok && r.profile.allergyIngredientIds).toEqual([]);
    const named = toProfile({ ...REQUIRED, allergyHistory: 'yes', allergens: ['niacinamide'] });
    expect(named.ok && named.profile.allergyIngredientIds).toEqual(['niacinamide']);
    // Allergens chosen before changing the answer to "No" are dropped.
    const changed = toProfile({ ...REQUIRED, allergyHistory: 'no', allergens: ['niacinamide'] });
    expect(changed.ok && changed.profile.allergyIngredientIds).toEqual([]);
  });

  it('owned products keep their role and prescription flag, with ingredients unknown; blank rows are dropped', () => {
    const r = toProfile({
      ...REQUIRED,
      ownedItems: [
        { id: 'o1', label: ' My cleanser ', role: 'cleanse', prescribed: false },
        { id: 'o2', label: '', role: 'other', prescribed: false },
        { id: 'o3', label: 'Cream from my doctor', role: 'other', prescribed: true },
      ],
    });
    expect(r.ok && r.profile.ownedItems).toEqual([
      { id: 'o1', label: 'My cleanser', ingredientIds: [], coverage: 'unknown', prescribed: false, role: 'cleanse' },
      {
        id: 'o3',
        label: 'Cream from my doctor',
        ingredientIds: [],
        coverage: 'unknown',
        prescribed: true,
        role: 'other',
      },
    ]);
  });
});

describe('questions', () => {
  it('the allergen list appears only after a "Yes", and progress counts only the questions shown', () => {
    expect(activeQuestions({}).some((q) => q.id === 'allergens')).toBe(false);
    expect(activeQuestions({ allergyHistory: 'yes' }).length).toBe(QUESTIONS.length);
    expect(activeQuestions({ allergyHistory: 'unknown' }).length).toBe(QUESTIONS.length - 1);
  });

  it('every safety question can be skipped; the required ones cannot', () => {
    const skippable = QUESTIONS.filter((q) => q.kind === 'single' && q.skippable).map((q) => q.id);
    expect(skippable).toEqual([
      'skinType',
      'reactivity',
      'currentlyIrritated',
      'ageBand',
      'pregnancy',
      'nursing',
      'allergyHistory',
      'prescribedTreatment',
    ]);
  });

  it('validates the budget as whole rupees from 0 to 10,000', () => {
    expect(budgetProblem(0)).toBeNull();
    expect(budgetProblem(10_000)).toBeNull();
    expect(budgetProblem(undefined)).toMatch(/Enter an amount/);
    expect(budgetProblem(12.5)).toMatch(/whole rupees/);
    expect(budgetProblem(-1)).toMatch(/0 to 10,000/);
    expect(budgetProblem(10_001)).toMatch(/0 to 10,000/);
    const budget = QUESTIONS.find((q) => q.kind === 'budget')!;
    expect(isAnswered(budget, { budgetRupees: 0 })).toBe(true);
  });
});
