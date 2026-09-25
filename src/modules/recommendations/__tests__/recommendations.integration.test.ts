import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ingredientInteractions, ingredients, orderItems, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';
import { PRODUCTS } from '@/data/mock-data';

/**
 * Recommendations: explainable, deterministic, and never a product that
 * works against the one the customer is looking at.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({
  db,
  getDatabase: () => db,
  isDatabaseConfigured: () => true,
  readWith: (_c: string, query: (d: typeof db) => Promise<unknown>) => query(db),
}));

const { rankRecommendations, MIN_SUPPORT } = await import('../ranking');
const { recommendationsFor, coPurchases } = await import('../recommendations');
const { cache, POLICIES } = await import('@/infrastructure/cache');

const product = (id: string) => PRODUCTS.find((p) => p.id === id)!;

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(
    sql`truncate orders, order_items, ingredients, ingredient_interactions restart identity cascade`
  );
  cache.clearLocal();
  await cache.invalidateNamespace(POLICIES.recommendations);
  await cache.invalidateNamespace(POLICIES.ingredients);
});

let orderSeq = 0;
async function paidOrder(productIds: string[], status: 'paid' | 'cancelled' = 'paid') {
  orderSeq += 1;
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `AVY-T${orderSeq}`,
      email: 'test@example.com',
      status,
      paymentStatus: 'paid',
      paymentMethod: 'razorpay',
      subtotal: 100,
      total: 100,
    } as typeof orders.$inferInsert)
    .returning({ id: orders.id });
  await db.insert(orderItems).values(
    productIds.map((productId) => ({
      orderId: order.id,
      productId,
      productName: productId,
      size: '30ml',
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
    })) as (typeof orderItems.$inferInsert)[]
  );
}

describe('ranking (pure)', () => {
  it('prefers another step of the routine with the same concerns', () => {
    const recs = rankRecommendations(product('ha-toner'), PRODUCTS);
    expect(recs[0].reason).toBe('routine_fit');
    expect(product(recs[0].productId).category).not.toBe('toner');
  });

  it('ignores co-purchases below the support threshold', () => {
    const recs = rankRecommendations(product('ha-toner'), PRODUCTS, {
      coPurchases: new Map([['lip-mask', MIN_SUPPORT - 1]]),
    });
    expect(recs.find((r) => r.productId === 'lip-mask')?.reason).not.toBe('bought_together');
  });

  it('puts products bought together first once the evidence is there', () => {
    const recs = rankRecommendations(product('ha-toner'), PRODUCTS, {
      coPurchases: new Map([['lip-mask', MIN_SUPPORT]]),
    });
    expect(recs[0]).toMatchObject({ productId: 'lip-mask', reason: 'bought_together' });
  });

  it('never suggests the product itself, a conflict, or something sold out', () => {
    const recs = rankRecommendations(product('ceramide-cream'), PRODUCTS, {
      conflicts: new Set(['rice-toner']),
      available: (id) => id !== 'ha-toner',
    }, 30);
    const ids = recs.map((r) => r.productId);
    expect(ids).not.toContain('ceramide-cream');
    expect(ids).not.toContain('rice-toner');
    expect(ids).not.toContain('ha-toner');
  });

  it('always fills the slot, and gives the same answer every time', () => {
    const a = rankRecommendations(product('pdrn-booster'), PRODUCTS);
    expect(a).toHaveLength(4);
    expect(rankRecommendations(product('pdrn-booster'), PRODUCTS)).toEqual(a);
  });
});

describe('purchase history', () => {
  it('counts distinct paid orders, ignoring cancelled ones', async () => {
    await paidOrder(['retinol', 'ceramide-cream']);
    await paidOrder(['retinol', 'ceramide-cream', 'ha-toner']);
    await paidOrder(['retinol', 'ha-toner'], 'cancelled');

    const counts = await coPurchases('retinol');
    expect(counts.get('ceramide-cream')).toBe(2);
    expect(counts.get('ha-toner')).toBe(1);
  });

  it('turns two orders together into a "bought together" suggestion', async () => {
    await paidOrder(['retinol', 'lip-mask']);
    await paidOrder(['retinol', 'lip-mask']);
    const recs = await recommendationsFor('retinol');
    expect(recs[0]).toMatchObject({ productId: 'lip-mask', reason: 'bought_together' });
  });
});

describe('ingredient conflicts', () => {
  beforeEach(async () => {
    await db.insert(ingredients).values([
      { id: 'retinol', inciName: 'Retinol', commonName: 'Retinol' },
      { id: 'ascorbic-acid', inciName: 'Ascorbic Acid', commonName: 'Vitamin C', synonyms: ['vitamin c'] },
      { id: 'aha', inciName: 'Glycolic Acid', commonName: 'AHA', synonyms: ['aha'] },
    ] as (typeof ingredients.$inferInsert)[]);
    await db.insert(ingredientInteractions).values([
      // Test data, not a claim about chemistry: one established pair, one irritation pair.
      { ingredientA: 'ascorbic-acid', ingredientB: 'retinol', tier: 2, summary: 's', advice: 'a', citation: 'test' },
      { ingredientA: 'aha', ingredientB: 'retinol', tier: 3, summary: 's', advice: 'a' },
    ]);
  });

  it('hides a product with an established conflict, even when often bought together', async () => {
    await paidOrder(['retinol', 'vitamin-c-serum']);
    await paidOrder(['retinol', 'vitamin-c-serum']);

    const ids = (await recommendationsFor('retinol', { limit: 30 })).map((r) => r.productId);
    expect(ids).not.toContain('vitamin-c-serum');
  });

  it('works in both directions of the rule', async () => {
    const ids = (await recommendationsFor('vitamin-c-serum', { limit: 30 })).map((r) => r.productId);
    expect(ids).not.toContain('retinol');
  });

  it('keeps a product whose interaction is only irritation advice', async () => {
    const ids = (await recommendationsFor('retinol', { limit: 30 })).map((r) => r.productId);
    expect(ids).toContain('bifida-exfoliating-pads');
  });
});

describe('availability', () => {
  it('skips a product with no units in any size', async () => {
    const stock = Object.fromEntries(
      PRODUCTS.flatMap((p) => p.sizes.map((s) => [`${p.id}::${s.label}`, p.id === 'ceramide-cream' ? 0 : 5]))
    );
    const ids = (await recommendationsFor('rice-toner', { limit: 30, stock })).map((r) => r.productId);
    expect(ids).not.toContain('ceramide-cream');
  });

  it('keeps products that simply have not been counted yet', async () => {
    const recs = await recommendationsFor('ha-toner', { stock: {} });
    expect(recs).toHaveLength(4);
  });
});
