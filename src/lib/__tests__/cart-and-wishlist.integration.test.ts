import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { carts, cartItems, users, wishlistItems } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Durable cart and wishlist, with a cache in front.
 *
 * Postgres is the record; the cache may hold a copy and may lose it. These
 * tests pin both halves: concurrent writes stay correct, and a read after a
 * write never returns the pre-write state from cache.
 */

// A real L2 for these tests. Without it the cart policy (no L1) would have no
// cache layer at all, and the invalidation tests would pass by never caching.
process.env.CACHE_L2 = 'memory';

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { saveCart, loadCart, mergeCarts } = await import('../cart-server');
const { getWishlist, setWishlist } = await import('@/modules/wishlist/wishlist');
const { cache, POLICIES } = await import('@/infrastructure/cache');

const USER = 'user-1';
const line = (productId: string, quantity = 1) => ({ productId, size: '150ml', quantity });

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate carts, cart_items, wishlist_items, users restart identity cascade`);
  await db.insert(users).values({ id: USER, email: 'priya@example.com' });
  // Retire every cached cart and wishlist from earlier tests, in L2 as well.
  await cache.invalidateNamespace(POLICIES.cart);
  await cache.invalidateNamespace(POLICIES.wishlist);
});

describe('cart', () => {
  it('creates exactly one cart when first saves race', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => saveCart([line('rice-bran-cleansing-oil', i + 1)], USER, null))
    );
    expect(await db.select().from(carts)).toHaveLength(1);
  });

  it('serialises simultaneous saves of one cart instead of failing one', async () => {
    await saveCart([line('rice-bran-cleansing-oil')], USER, null);

    const results = await Promise.allSettled([
      saveCart([line('rice-bran-cleansing-oil', 2)], USER, null),
      saveCart([line('centella-cleansing-balm', 3)], USER, null),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    // Whichever ran second wins, whole — never a mix of the two.
    const items = await db.select().from(cartItems);
    expect(items).toHaveLength(1);
  });

  it('merges repeated lines for the same product and size', async () => {
    await saveCart([line('rice-bran-cleansing-oil', 2), line('rice-bran-cleansing-oil', 3)], USER, null);
    const items = await db.select().from(cartItems);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it('never returns a pre-write cart from cache after a save', async () => {
    await saveCart([line('rice-bran-cleansing-oil', 1)], USER, null);
    expect(await loadCart(USER, null)).toEqual([line('rice-bran-cleansing-oil', 1)]);
    // Prove the second read is cached, so the next assertion means something.
    const hitsBefore = cache.stats.l2Hits;
    await loadCart(USER, null);
    expect(cache.stats.l2Hits).toBe(hitsBefore + 1);

    await saveCart([line('rice-bran-cleansing-oil', 4)], USER, null);
    expect(await loadCart(USER, null)).toEqual([line('rice-bran-cleansing-oil', 4)]);
  });

  it('reads straight from Postgres when the cache has lost everything', async () => {
    await saveCart([line('rice-bran-cleansing-oil', 2)], USER, null);
    await loadCart(USER, null);
    cache.clearLocal();
    expect(await loadCart(USER, null)).toEqual([line('rice-bran-cleansing-oil', 2)]);
  });

  it('shows the merged cart, not a cached one, after sign-in', async () => {
    await saveCart([line('centella-cleansing-balm', 1)], null, 'anon-1');
    await saveCart([line('rice-bran-cleansing-oil', 1)], USER, null);
    await loadCart(USER, null);

    await mergeCarts(USER, 'anon-1');

    const merged = await loadCart(USER, null);
    expect(merged.map((l) => l.productId).sort()).toEqual(['centella-cleansing-balm', 'rice-bran-cleansing-oil']);
  });
});

describe('the cart uniqueness migration', () => {
  it('keeps each person’s newest cart when duplicates exist, then indexes cleanly', async () => {
    // Recreate the state before the migration: indexes absent, duplicates present.
    await db.execute(sql`drop index carts_user_unique`);
    await db.execute(sql`drop index carts_anon_unique`);
    await db.insert(carts).values([
      { id: 'old', userId: USER, updatedAt: new Date('2026-01-01') },
      { id: 'new', userId: USER, updatedAt: new Date('2026-06-01') },
      { id: 'anon-old', anonymousId: 'a1', updatedAt: new Date('2026-01-01') },
      { id: 'anon-new', anonymousId: 'a1', updatedAt: new Date('2026-06-01') },
    ]);

    // The exact statements shipped in the migration file.
    const file = readdirSync('drizzle').find((f) => f.startsWith('0011_'))!;
    const statements = readFileSync(join('drizzle', file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.includes('DELETE FROM "carts"') || s.includes('CREATE UNIQUE INDEX "carts_'));
    for (const statement of statements) await db.execute(sql.raw(statement.replace(/^--.*$/gm, '')));

    const left = await db.select({ id: carts.id }).from(carts);
    expect(left.map((c) => c.id).sort()).toEqual(['anon-new', 'new']);
  });
});

describe('wishlist', () => {
  it('persists across a lost cache', async () => {
    await setWishlist(USER, ['rice-bran-cleansing-oil', 'centella-cleansing-balm']);
    cache.clearLocal();
    expect(await getWishlist(USER)).toEqual(['rice-bran-cleansing-oil', 'centella-cleansing-balm']);
  });

  it('shows a change immediately after writing it', async () => {
    await setWishlist(USER, ['rice-bran-cleansing-oil']);
    expect(await getWishlist(USER)).toEqual(['rice-bran-cleansing-oil']);
    await setWishlist(USER, []);
    expect(await getWishlist(USER)).toEqual([]);
  });

  it('drops unknown products and duplicates', async () => {
    const stored = await setWishlist(USER, ['rice-bran-cleansing-oil', 'no-such-product', 'rice-bran-cleansing-oil']);
    expect(stored).toEqual(['rice-bran-cleansing-oil']);
    expect(await db.select().from(wishlistItems)).toHaveLength(1);
  });

  it('is idempotent: the same list twice leaves the same rows', async () => {
    await setWishlist(USER, ['rice-bran-cleansing-oil']);
    await setWishlist(USER, ['rice-bran-cleansing-oil']);
    expect(await db.select().from(wishlistItems)).toHaveLength(1);
  });
});
