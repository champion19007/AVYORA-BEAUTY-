import { describe, expect, it, vi } from 'vitest';

/**
 * The owner's published catalogue replaces the samples everywhere: the shop
 * lists exactly what was published, nothing is labelled a sample, and the
 * routine finder recommends only products on sale (a launch range leaves
 * most slots empty, which must not crash or link to hidden samples).
 */
vi.mock('@/data/catalogue.published.json', () => ({
  default: {
    publishedAt: '2026-10-24T00:00:00.000Z',
    products: [
      {
        id: 'avyora-face-wash',
        name: 'Face Wash',
        slug: 'avyora-face-wash',
        tagline: '',
        description: 'A gentle face wash.',
        images: ['/images/products/coming-soon.jpg'],
        price: 399,
        isBestSeller: false,
        isNewLaunch: true,
        category: 'cleanser',
        concerns: [],
        ingredients: [],
        sizes: [{ label: '100ml', price: 399 }],
        routineSlot: 'gelCleanser',
      },
      {
        id: 'avyora-mineral-sunscreen',
        name: 'Mineral Sunscreen',
        slug: 'avyora-mineral-sunscreen',
        tagline: '',
        description: 'A zinc oxide sunscreen.',
        images: ['/images/products/coming-soon.jpg'],
        price: 599,
        isBestSeller: false,
        isNewLaunch: true,
        category: 'sun',
        concerns: [],
        ingredients: [],
        sizes: [{ label: '50ml', price: 599 }],
        routineSlot: 'sunscreen',
      },
    ],
  },
}));

const { CATALOGUE_MODE, IS_SAMPLE_CATALOGUE } = await import('../catalogue-mode');
const { PRODUCTS } = await import('@/data/mock-data');
const { productForSlot } = await import('../routine-slots');
const { getRecommendation } = await import('../routine-engine');
const { ROUTINE_ROLES } = await import('@/data/routine-roles');

describe('managed catalogue', () => {
  it('shows exactly the published products, not as samples', () => {
    expect(CATALOGUE_MODE).toBe('managed');
    expect(IS_SAMPLE_CATALOGUE).toBe(false);
    expect(PRODUCTS.map((p) => p.id)).toEqual(['avyora-face-wash', 'avyora-mineral-sunscreen']);
  });

  it('fills routine slots from the owner’s assignments, with close substitutes', () => {
    expect(productForSlot('gelCleanser')?.id).toBe('avyora-face-wash');
    // Sensitive skin asks for the balm; the face wash is its substitute.
    expect(productForSlot('cleansingBalm')?.id).toBe('avyora-face-wash');
    expect(productForSlot('moisturizerLight')).toBeUndefined();
    // The planner and the homepage read roles from the same slots.
    expect(ROUTINE_ROLES['avyora-face-wash']).toBe('cleanse');
    expect(ROUTINE_ROLES['avyora-mineral-sunscreen']).toBe('protect');
  });

  it('builds a routine that links only to products on sale', () => {
    const r = getRecommendation({
      concern: 'Dullness & Uneven Tone',
      secondaryConcerns: [],
      skinType: 'dry',
      reactivity: 'rarely',
      age: '25_34',
      sun: 'moderate',
      experience: 'experienced',
      consistency: 'every',
      currentCondition: 'clear',
      darkCircles: 'mild',
      darkSpots: 'no',
      bodyCare: 'yes',
      pregnancy: 'no',
    });
    const steps = [...r.morningRoutine, ...r.eveningRoutine, ...(r.optionalSteps ?? [])];
    const linked = steps.flatMap((s) => (s.productId ? [s.productId] : []));
    expect(new Set(linked)).toEqual(new Set(['avyora-face-wash', 'avyora-mineral-sunscreen']));
    // The moisturiser step stays, without a product: "use one you have".
    const moisturise = r.morningRoutine.find((s) => s.category === 'hydrate');
    expect(moisturise).toMatchObject({ isAvyoraProduct: false });
    expect(moisturise?.productId).toBeUndefined();
  });
});
