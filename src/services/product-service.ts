/**
 * @fileOverview Read access to the Avyora catalogue, plus the deterministic
 * sample series the admin panel charts.
 */

import { Product } from '@/data/mock-data';
import { allProducts, getProductById } from '@/lib/catalogue';

/**
 * Why this is no longer a stateful singleton:
 *
 * The previous implementation held a mutable copy of the catalogue on a
 * module-level singleton and exposed `updateProductPrice` to mutate it. On a
 * serverless platform that is actively wrong — each instance keeps its own
 * copy, so an edit applies to whichever instance served the request, is
 * invisible to every other instance, and disappears when the instance is
 * recycled. Under real traffic, different customers see different prices.
 *
 * Reads are now pure functions over the indexed catalogue. Writes belong in a
 * database; `updateProductPrice` is intentionally absent rather than present
 * and misleading. See docs/scaling.md.
 */
export const ProductService = {
  getAllProducts(): readonly Product[] {
    return allProducts();
  },

  getProductById(id: string): Product | undefined {
    return getProductById(id);
  },

  /**
   * Deterministic pseudo-random series for the admin charts, seeded from the
   * product id.
   *
   * This used `Math.random()`, which meant the chart changed on every render
   * and disagreed between server and client — a hydration mismatch, and
   * numbers no one could act on. Seeding keeps a given SKU's chart stable
   * while remaining obviously synthetic.
   */
  getProductSimulatedPerformance(productId: string) {
    const rand = seededRandom(hashString(productId));
    const base = Math.floor(rand() * 50) + 20;
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      volume: Math.max(0, base + Math.floor(rand() * 20) - 10),
      conversion: (rand() * 5 + 2).toFixed(1),
    }));
  },
};

/** FNV-1a, enough to turn a SKU id into a stable seed. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
