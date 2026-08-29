import { describe, it, expect } from 'vitest';
import { getRecommendation } from '../routine-engine';
import { unresolvedSlots } from '../routine-slots';
import { PRODUCTS } from '@/data/mock-data';
import type { RoutineStep } from '../routine-types';

const CATALOGUE_IDS = new Set(PRODUCTS.map((p) => p.id));

const baseAnswers = {
  concern: 'Fine Lines & Aging',
  secondaryConcerns: [],
  skinType: 'normal',
  reactivity: 'rarely',
  age: '25_34',
  sun: 'moderate',
  experience: 'experienced',
  consistency: 'every',
  currentCondition: 'clear',
  darkCircles: 'no',
  darkSpots: 'no',
  bodyCare: 'no',
  pregnancy: 'no',
};

/** Every combination worth exercising, rather than one happy path. */
function profileMatrix() {
  const out: any[] = [];
  for (const skinType of ['oily', 'dry', 'combination', 'normal', 'sensitive']) {
    for (const experience of ['none', 'beginner', 'basic', 'regular', 'experienced']) {
      for (const reactivity of ['rarely', 'sometimes', 'easily', 'very_high']) {
        for (const concern of [
          'Acne & Breakouts',
          'Dark Spots & Pigmentation',
          'Dullness & Uneven Tone',
          'Fine Lines & Aging',
          'Texture & Roughness',
          'Dryness',
          'Just Want a Simple Routine',
        ]) {
          out.push({ ...baseAnswers, skinType, experience, reactivity, concern });
        }
      }
    }
  }
  return out;
}

const allSteps = (r: ReturnType<typeof getRecommendation>): RoutineStep[] => [
  ...r.morningRoutine,
  ...r.eveningRoutine,
  ...r.bodyRoutine,
];

describe('routine slots', () => {
  it('all resolve to real catalogue SKUs', () => {
    expect(unresolvedSlots()).toEqual([]);
  });
});

describe('getRecommendation', () => {
  const matrix = profileMatrix();

  it('never recommends a product missing from the catalogue', () => {
    const bad = new Set<string>();
    for (const answers of matrix) {
      for (const step of allSteps(getRecommendation(answers))) {
        if (step.isAvyoraProduct && step.productId && !CATALOGUE_IDS.has(step.productId)) {
          bad.add(step.productId);
        }
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('gives every step a name and a purchasable size', () => {
    for (const answers of matrix.slice(0, 60)) {
      for (const step of allSteps(getRecommendation(answers))) {
        expect(step.productName, `name for ${step.productId}`).toBeTruthy();
        expect(step.productSize, `size for ${step.productId}`).toBeTruthy();
      }
    }
  });

  it('is deterministic', () => {
    const a = getRecommendation(baseAnswers);
    const b = getRecommendation(baseAnswers);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('never schedules retinol on the same night as an exfoliant', () => {
    for (const answers of matrix) {
      const r = getRecommendation(answers);
      const retinol = r.eveningRoutine.find((s) => s.productId === 'retinol');
      const exfoliant = r.eveningRoutine.find((s) => s.category === 'exfoliate');
      if (retinol && exfoliant) {
        // Both may appear in the printed routine, but the exfoliant must carry
        // an explicit instruction keeping it off retinol nights.
        expect(
          `${exfoliant.frequency ?? ''} ${exfoliant.explanation}`.toLowerCase()
        ).toContain('retinol night');
      }
    }
  });

  it('withholds retinoids during pregnancy', () => {
    const r = getRecommendation({ ...baseAnswers, pregnancy: 'yes' });
    expect(r.eveningRoutine.some((s) => s.productId === 'retinol')).toBe(false);
    expect(r.treatmentSchedule?.retinol).toBeUndefined();
    expect(r.warnings.join(' ').toLowerCase()).toContain('pregnant');
  });

  it('withholds retinoids under 18 and while skin is irritated', () => {
    for (const override of [{ age: 'under18' }, { currentCondition: 'irritated' }]) {
      const r = getRecommendation({ ...baseAnswers, ...override });
      expect(r.eveningRoutine.some((s) => s.productId === 'retinol')).toBe(false);
    }
  });

  it('keeps vitamin C in the morning and retinol at night', () => {
    for (const answers of matrix) {
      const r = getRecommendation(answers);
      expect(r.eveningRoutine.some((s) => s.productId === 'vitamin-c-serum')).toBe(false);
      expect(r.morningRoutine.some((s) => s.productId === 'retinol')).toBe(false);
    }
  });

  it('applies vitamin C before the hydrating essence layer', () => {
    const r = getRecommendation({ ...baseAnswers, concern: 'Dullness & Uneven Tone' });
    const vitC = r.morningRoutine.findIndex((s) => s.productId === 'vitamin-c-serum');
    const essence = r.morningRoutine.findIndex((s) => s.category === 'essence');
    expect(vitC).toBeGreaterThanOrEqual(0);
    expect(essence).toBeGreaterThanOrEqual(0);
    expect(vitC).toBeLessThan(essence);
  });

  it('always finishes the morning routine with SPF', () => {
    for (const answers of matrix) {
      const am = getRecommendation(answers).morningRoutine;
      expect(am[am.length - 1].category).toBe('protect');
    }
  });

  it('always tells the customer to patch test', () => {
    for (const answers of matrix.slice(0, 40)) {
      expect(getRecommendation(answers).warnings.join(' ').toLowerCase()).toContain('patch test');
    }
  });

  it('orders steps consecutively from 1', () => {
    for (const answers of matrix.slice(0, 40)) {
      const r = getRecommendation(answers);
      for (const routine of [r.morningRoutine, r.eveningRoutine]) {
        expect(routine.map((s) => s.order)).toEqual(routine.map((_, i) => i + 1));
      }
    }
  });

  it('de-duplicates the shopping list', () => {
    for (const answers of matrix.slice(0, 40)) {
      const ids = getRecommendation(answers).recommendedProducts.map((p) => p.productId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
