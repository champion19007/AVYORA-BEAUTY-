import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { isDatabaseConfigured, readWith } from '@/db';
import { ingredientInteractions, orderItems, orders } from '@/db/schema';
import { allProducts, getProductById } from '@/lib/catalogue';
import { resolveIngredients } from '@/lib/interactions';
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

/**
 * Products whose ingredients have an established (tier 2) conflict with this
 * one's. Tier 3 and 4 findings (irritation, sequencing) are advice for a
 * routine, not reasons to hide a product.
 */
export async function conflictingProducts(productId: string): Promise<Set<string>> {
  const target = getProductById(productId);
  if (!target || !isDatabaseConfigured()) return new Set();

  const ids = await cache.getOrSet(POLICIES.recommendations, `conflicts:${productId}`, async () => {
    const products = allProducts();
    const resolved = await Promise.all(
      products.map(async (p) => [p.id, await resolveIngredients(p.ingredients.join(', '))] as const)
    );
    const byProduct = new Map(resolved);
    const mine = byProduct.get(productId) ?? [];
    if (mine.length === 0) return [];

    const others = [...new Set(resolved.flatMap(([id, ing]) => (id === productId ? [] : ing)))];
    if (others.length === 0) return [];

    const pairs = await readWith('eventual', (db) =>
      db
        .select({ a: ingredientInteractions.ingredientA, b: ingredientInteractions.ingredientB })
        .from(ingredientInteractions)
        .where(
          and(
            eq(ingredientInteractions.tier, 2),
            or(
              and(inArray(ingredientInteractions.ingredientA, mine), inArray(ingredientInteractions.ingredientB, others)),
              and(inArray(ingredientInteractions.ingredientB, mine), inArray(ingredientInteractions.ingredientA, others))
            )
          )
        )
    );

    const clashing = new Set(pairs.flatMap((p) => [p.a, p.b]).filter((id) => !mine.includes(id)));
    return resolved
      .filter(([id, ing]) => id !== productId && ing.some((i) => clashing.has(i)))
      .map(([id]) => id);
  });

  return new Set(ids);
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
    conflictingProducts(productId).catch((err) => {
      reportError(err, { scope: 'recommendations.conflicts', extra: { productId } });
      return new Set<string>();
    }),
  ]);

  const stock = options.stock;
  return rankRecommendations(
    target,
    allProducts(),
    {
      coPurchases: together,
      conflicts,
      /*
       * Hidden only when *known* to be sold out: every size counted, all at
       * zero. An uncounted SKU stays in — its card carries its own badge —
       * because treating "not counted" as "sold out" here emptied the whole
       * section on any shop without a complete stock count.
       */
      available: stock
        ? (id) =>
            !(getProductById(id)?.sizes ?? []).every((s) => stock[`${id}::${s.label}`] === 0)
        : undefined,
    },
    options.limit ?? 4
  );
}
