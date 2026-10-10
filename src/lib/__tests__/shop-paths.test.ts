import { describe, expect, it } from 'vitest';
import { isShopPath } from '@/lib/catalogue-mode';

describe('sample notice placement', () => {
  it.each([
    '/collections',
    '/collections/cleansers',
    '/products/low-ph-cleanser',
    '/compare',
    '/checkout',
    '/checkout/return',
  ])('shows on %s', (path) => expect(isShopPath(path)).toBe(true));

  it.each(['/', '/routine-finder', '/contact', '/productsale', '/checkouts'])('stays off %s', (path) =>
    expect(isShopPath(path)).toBe(false)
  );
});
