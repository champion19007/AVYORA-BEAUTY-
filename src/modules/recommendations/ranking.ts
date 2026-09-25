import type { Product } from '@/data/mock-data';

/**
 * Which products to suggest alongside one — the pure part, with no database.
 *
 * Deterministic and explainable on purpose. Every suggestion carries the
 * reason it was made, and the same inputs always give the same list. There is
 * no model here: with a few dozen products and a young order history, a
 * learned ranking would mostly learn noise, and a skincare shop recommending
 * something because "the model said so" cannot answer the customer who asks
 * why.
 *
 * The rules, strongest first:
 *
 *   never     the product itself; anything sold out; anything whose
 *             ingredients have an established (tier 2) conflict with this
 *             one's — suggesting a retinoid beside a vitamin C that
 *             deactivates it is worse than suggesting nothing
 *   bought together   other products in the same paid orders, once at least
 *                     `MIN_SUPPORT` orders show it (one order is anecdote)
 *   routine fit       shared skin concerns, preferring a *different* step of
 *                     the routine (a toner next to a cleanser, not a second
 *                     cleanser), then shared ingredients
 *   fill              catalogue order, so the slot is never half empty
 */

export const MIN_SUPPORT = 2;

export type Reason = 'bought_together' | 'routine_fit' | 'fill';

export type Recommendation = { productId: string; reason: Reason; score: number };

export type RankingSignals = {
  /** Paid orders containing both products, keyed by the other product's id. */
  coPurchases?: ReadonlyMap<string, number>;
  /** Products that must never be suggested next to this one. */
  conflicts?: ReadonlySet<string>;
  /** Whether a product can be bought now. Omitted: assume it can. */
  available?: (productId: string) => boolean;
};

export function rankRecommendations(
  target: Product,
  catalogue: readonly Product[],
  signals: RankingSignals = {},
  limit = 4
): Recommendation[] {
  const concerns = new Set(target.concerns);
  const ingredients = new Set(target.ingredients.map((i) => i.toLowerCase()));

  const eligible = catalogue
    .map((product, order) => ({ product, order }))
    .filter(
      ({ product }) =>
        product.id !== target.id &&
        !signals.conflicts?.has(product.id) &&
        (signals.available?.(product.id) ?? true)
    );

  const scored = eligible.map(({ product, order }) => {
    const together = signals.coPurchases?.get(product.id) ?? 0;
    const sharedConcerns = product.concerns.filter((c) => concerns.has(c)).length;
    const sharedIngredients = product.ingredients.filter((i) => ingredients.has(i.toLowerCase())).length;
    const otherStep = product.category !== target.category;

    const fit = sharedConcerns > 0 ? sharedConcerns * 3 + (otherStep ? 2 : 0) + sharedIngredients : 0;
    const bought = together >= MIN_SUPPORT ? 100 + together * 10 : 0;

    const reason: Reason = bought ? 'bought_together' : fit ? 'routine_fit' : 'fill';
    return { productId: product.id, reason, score: bought + fit, order };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ productId, reason, score }) => ({ productId, reason, score }));
}
