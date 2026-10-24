import { describe, expect, it, vi } from 'vitest';

/**
 * A preview publish shows the owner's products but sells nothing: everything
 * is labelled a sample, and a production build refuses orders.
 */
vi.mock('@/data/catalogue.published.json', () => ({
  default: {
    publishedAt: '2026-10-24T00:00:00.000Z',
    preview: true,
    products: [
      {
        id: 'avyora-face-wash',
        name: 'Face Wash',
        slug: 'avyora-face-wash',
        tagline: '',
        description: 'Full details, ingredients and photos are coming soon.',
        images: ['/images/products/coming-soon.jpg'],
        price: 349,
        isBestSeller: false,
        isNewLaunch: true,
        category: 'cleanser',
        concerns: [],
        ingredients: [],
        sizes: [{ label: '150ml', price: 349 }],
        routineSlot: 'gelCleanser',
      },
    ],
  },
}));

const { CATALOGUE_MODE, IS_SAMPLE_CATALOGUE, sampleOrdersBlocked } = await import('../catalogue-mode');
const { PRODUCTS } = await import('@/data/mock-data');

describe('preview catalogue', () => {
  it('shows only the published products, labelled as samples, with orders refused in production', () => {
    expect(CATALOGUE_MODE).toBe('managed');
    expect(PRODUCTS.map((p) => p.id)).toEqual(['avyora-face-wash']);
    expect(IS_SAMPLE_CATALOGUE).toBe(true);
    expect(sampleOrdersBlocked({ NODE_ENV: 'production' })).toBe(true);
  });
});
