import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { isDatabaseConfigured, readWith } from '@/db';
import { ingredientInteractions, orderItems, orders } from '@/db/schema';
import { allProducts, getProductById } from '@/lib/catalogue';
import { possibleIds, resolveLabels } from '@/modules/ingredients/resolve';
import { cache, POLICIES } from '@/infrastructure/cache';
import { reportError } from '@/lib/observability';
import { rankRecommendations, type Recommendation } from './ranking';

/**
 * Recommendations with their data: purchase history and ingredient rules.
 *
 * Both lookups are statistics, not state, so both read with 'eventual'
 * consistency (the replica, when there is one) and are cached for an hour.
 *
 * That makes them the one exception to "cache fills read the primary". The
 * rule exists because an invalidation followed by a lagging refill re-caches
 * stale data; nothing ever invalidates these, so there is no write they must
 * reflect, and an order that lands a few seconds late in a co-purchase count
 * changes nothing.
 * A missing or failed lookup degrades the list, never the page: without
 * history the list is routine fit alone.
 */

/** Other products in the same paid orders, with how many orders show the pair. */
export async function coPurchases(productId: string): Promise<Map<string, number>> {
  if (!isDatabaseConfigured()) return new Map();

  const rows = await cache.getOrSet(POLICIES.recommendations, `copurchase:${productId}`, () =>
    readWith('eventual', (db) => {
      const mine = sql`(select ${orderItems.orderId} from ${orderItems} where ${orderItems.productId} = ${productId})`;
      return db
        .select({
          productId: orderItems.productId,
          orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            sql`${orderItems.orderId} in ${mine}`,
            ne(orderItems.productId, productId),
            eq(orders.paymentStatus, 'paid'),
            ne(orders.status, 'cancelled'),
            ne(orders.status, 'refunded')
          )
        )
        .groupBy(orderItems.productId);
    })
  );

  return new Map(rows.map((r) => [r.productId, Number(r.orders)]));
}

export type ConflictCheck = {
  /** Established (tier 2) conflict, or possible through an ambiguous label: never suggested. */
  conflicts: Set<string>;
  /**
   * No known conflict, but some highlight did not resolve, so the check is
   * incomplete. Still suggested, never as a routine fit: unknown is not "compatible".
   */
  unchecked: Set<string>;
};

/**
 * Tier 2 conflicts between this product and every other, from the
 * products' ingredient highlights resolved through the canonical alias map.
 * Tier 3 and 4 findings (irritation, sequencing) are advice for a routine,
 * not reasons to hide a product.
 *
 * Highlights are not full formulations, so this can only find conflicts
 * among the ingredients it can identify; everything it cannot is reported
 * in `unchecked` instead of being read as "no conflict" (audit #18).
 */
export async function conflictingProducts(productId: string): Promise<ConflictCheck> {
  const target = getProductById(productId);
  if (!target || !isDatabaseConfigured()) return { conflicts: new Set(), unchecked: new Set() };

  const result = await cache.getOrSet(POLICIES.recommendations, `conflicts:v2:${productId}`, async () => {
    const products = allProducts();
    const resolved = new Map(products.map((p) => [p.id, resolveLabels(p.ingredients)] as const));
    const possible = new Map([...resolved].map(([id, r]) => [id, possibleIds(r)] as const));
    const mine = possible.get(productId) ?? [];
    const others = [...new Set(products.flatMap((p) => (p.id === productId ? [] : (possible.get(p.id) ?? []))))];

    const pairs =
      mine.length && others.length
        ? await readWith('eventual', (db) =>
            db
              .select({ a: ingredientInteractions.ingredientA, b: ingredientInteractions.ingredientB })
              .from(ingredientInteractions)
              .where(
                and(
                  eq(ingredientInteractions.tier, 2),
                  or(
                    and(
                      inArray(ingredientInteractions.ingredientA, mine),
                      inArray(ingredientInteractions.ingredientB, others)
                    ),
                    and(
                      inArray(ingredientInteractions.ingredientB, mine),
                      inArray(ingredientInteractions.ingredientA, others)
                    )
                  )
                )
              )
          )
        : [];

    const clashing = new Set(pairs.flatMap((p) => [p.a, p.b]).filter((id) => !mine.includes(id)));
    const targetComplete = resolved.get(productId)?.complete ?? false;
    const conflicts: string[] = [];
    const unchecked: string[] = [];
    for (const p of products) {
      if (p.id === productId) continue;
      if ((possible.get(p.id) ?? []).some((i) => clashing.has(i))) conflicts.push(p.id);
      else if (!targetComplete || !resolved.get(p.id)?.complete) unchecked.push(p.id);
    }
    return { conflicts, unchecked };
  });

  return { conflicts: new Set(result.conflicts), unchecked: new Set(result.unchecked) };
}

export async function recommendationsFor(
  productId: string,
  options: { limit?: number; stock?: Partial<Record<string, number>> } = {}
): Promise<Recommendation[]> {
  const target = getProductById(productId);
  if (!target) return [];

  const [together, conflicts] = await Promise.all([
    coPurchases(productId).catch((err) => {
      reportError(err, { scope: 'recommendations.copurchase', extra: { productId } });
      return new Map<string, number>();
    }),
    conflictingProducts(productId).catch((err): ConflictCheck => {
      reportError(err, { scope: 'recommendations.conflicts', extra: { productId } });
      // Unable to check at all: nothing counts as a routine fit.
      return { conflicts: new Set(), unchecked: new Set(allProducts().map((p) => p.id)) };
    }),
  ]);

  const stock = options.stock;
  return rankRecommendations(
    target,
    allProducts(),
    {
      coPurchases: together,
      conflicts: conflicts.conflicts,
      unchecked: conflicts.unchecked,
      /*
       * Hidden only when *known* to be sold out: every size counted, all at
       * zero. An uncounted SKU stays in — its card carries its own badge —
       * because treating "not counted" as "sold out" here emptied the whole
       * section on any shop without a complete stock count.
       */
      available: stock
        ? (id) => !(getProductById(id)?.sizes ?? []).every((s) => stock[`${id}::${s.label}`] === 0)
        : undefined,
    },
    options.limit ?? 4
  );
}
