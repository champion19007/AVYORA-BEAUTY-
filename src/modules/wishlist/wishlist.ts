import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { wishlistItems } from '@/db/schema';
import { cache, POLICIES } from '@/infrastructure/cache';
import { getProductById } from '@/lib/catalogue';

/**
 * A signed-in customer's saved products.
 *
 * Postgres is the record. Redis, where configured, is a read cache that is
 * invalidated after every write commits; if it expires or disappears, the next
 * read comes from the table. Nothing here depends on Redis keeping anything.
 *
 * Writes replace the whole list, like the cart mirror: the browser sends what
 * it currently holds. Setting a list is naturally idempotent — sending the same
 * list twice leaves the same rows — so it needs no idempotency key.
 */

const MAX_ITEMS = 200;

export async function getWishlist(userId: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];

  return cache.getOrSet(POLICIES.wishlist, userId, async () => {
    const rows = await db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(eq(wishlistItems.userId, userId))
      .orderBy(wishlistItems.addedAt);
    return rows.map((r) => r.productId);
  });
}

/**
 * Replaces the saved list with these products.
 *
 * Unknown product ids are dropped rather than stored: the list is shown back
 * as product cards, and an id with no product behind it would render as a
 * broken card forever.
 */
export async function setWishlist(userId: string, productIds: string[]): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];

  const clean = [...new Set(productIds)]
    .filter((id) => typeof id === 'string' && getProductById(id))
    .slice(0, MAX_ITEMS);

  await db.transaction(async (tx) => {
    await tx.delete(wishlistItems).where(eq(wishlistItems.userId, userId));
    if (clean.length > 0) {
      await tx
        .insert(wishlistItems)
        .values(clean.map((productId) => ({ userId, productId })))
        .onConflictDoNothing();
    }
  });

  await cache.invalidate(POLICIES.wishlist, userId);
  return clean;
}
