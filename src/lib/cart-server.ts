import { asc, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { carts, cartItems, wishlistItems } from '@/db/schema';
import { cache, POLICIES } from '@/infrastructure/cache';
import { getVariant } from '@/lib/catalogue';
import { MAX_QUANTITY_PER_SKU } from '@/lib/cart';
import { mergeCartLines, mergeWishlists, type MergeAdjustment } from '@/lib/cart-merge';
import { keyedHash } from '@/lib/rate-limit';
import { catalogueStock } from '@/modules/catalog/storefront-data';

/**
 * Server-side carts.
 *
 * The cart lived only in localStorage, which meant it did not survive a device
 * change, a cleared browser or a switch from phone to laptop, and the business
 * could not see abandoned carts at all — normally the single highest-value
 * email flow in direct-to-consumer retail.
 *
 * The browser remains the fast path: localStorage still drives the UI so the
 * cart is instant and works offline. This layer mirrors it, so the cart can be
 * recovered and analysed. For a signed-in customer the server cart is the
 * record: the browser reads it back (`/api/sync`) and adopts it. A guest's bag
 * is folded into the account by `mergeIntoAccount` (policy: lib/cart-merge).
 */

export type ServerCartLine = { productId: string; size: string; quantity: number };

export const ANONYMOUS_COOKIE = 'avyora_cart_id';

/**
 * An opaque, stable key for an account, sent to the browser so it can tell
 * whose bag it holds and notice when the signed-in account changes. A keyed
 * hash, so it reveals nothing about the user id.
 */
export function accountKey(userId: string): string {
  return keyedHash(`account:${userId}`);
}

/** Finds or creates the cart for a signed-in user or an anonymous visitor. */
async function resolveCartId(userId: string | null, anonymousId: string | null): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  if (!userId && !anonymousId) return null;

  const where = userId ? eq(carts.userId, userId) : eq(carts.anonymousId, anonymousId!);

  /*
   * Insert-first, decided by the partial unique index. Two requests racing
   * to create this person's first cart both attempt the insert; one lands and
   * the other does nothing, and both then read the one that exists.
   */
  await db
    .insert(carts)
    .values({ userId: userId ?? null, anonymousId: userId ? null : anonymousId })
    .onConflictDoNothing();

  const [cart] = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  return cart?.id ?? null;
}

/** The cache key for one person's cart. */
function cartCacheKey(userId: string | null, anonymousId: string | null): string | null {
  if (userId) return `u:${userId}`;
  if (anonymousId) return `a:${anonymousId}`;
  return null;
}

async function forgetCachedCart(userId: string | null, anonymousId: string | null): Promise<void> {
  const key = cartCacheKey(userId, anonymousId);
  if (key) await cache.invalidate(POLICIES.cart, key);
}

/**
 * Collapses repeated lines for the same product and size into one.
 *
 * The browser can send the same SKU twice (two tabs, an old bag merged into a
 * new one). The table holds one row per SKU, so a duplicate used to fail the
 * whole save.
 */
function mergeLines(lines: ServerCartLine[]): ServerCartLine[] {
  const merged = new Map<string, ServerCartLine>();
  for (const line of lines) {
    // Only real SKUs are stored; the purchase limit is the bag's (lib/cart).
    if (line.quantity <= 0 || !getVariant(line.productId, line.size)) continue;
    const key = `${line.productId}::${line.size}`;
    const existing = merged.get(key);
    merged.set(key, {
      ...line,
      quantity: Math.min((existing?.quantity ?? 0) + line.quantity, MAX_QUANTITY_PER_SKU),
    });
  }
  return [...merged.values()];
}

/** Replaces the stored cart with exactly these lines. */
export async function saveCart(
  lines: ServerCartLine[],
  userId: string | null,
  anonymousId: string | null
): Promise<void> {
  const cartId = await resolveCartId(userId, anonymousId);
  if (!cartId) return;

  const clean = mergeLines(lines);

  await db.transaction(async (tx) => {
    /*
     * Lock the cart row, so two saves of the same cart run one after the
     * other. Each save replaces the whole cart (delete, then insert); run
     * concurrently, the second one's inserts collided with the first one's on
     * the unique index and failed. Serialised, the later save simply wins.
     */
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).for('update');

    await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));

    if (clean.length > 0) {
      await tx
        .insert(cartItems)
        .values(clean.map((l) => ({ cartId, productId: l.productId, size: l.size, quantity: l.quantity })));
    }

    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  });

  // After the commit, never before: a reader between the two would otherwise
  // refill the cache from the old rows.
  await forgetCachedCart(userId, anonymousId);
}

/** Reads the stored cart. */
export async function loadCart(userId: string | null, anonymousId: string | null): Promise<ServerCartLine[]> {
  if (!isDatabaseConfigured()) return [];
  const key = cartCacheKey(userId, anonymousId);
  if (!key) return [];

  /*
   * Redis in front of Postgres, never instead of it. The cart policy keeps
   * nothing in process memory — another instance's stale copy would show a
   * customer the bag they had a moment ago — and a cache miss or an unreachable
   * Redis simply reads the table.
   */
  return cache.getOrSet(POLICIES.cart, key, async () => {
    const where = userId ? eq(carts.userId, userId) : eq(carts.anonymousId, anonymousId!);
    const [cart] = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
    if (!cart) return [];

    return db
      .select({
        productId: cartItems.productId,
        size: cartItems.size,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .where(eq(cartItems.cartId, cart.id));
  });
}

export type MergeOutcome = {
  lines: ServerCartLine[];
  wishlist: string[];
  adjustments: MergeAdjustment[];
};

/**
 * Folds a guest's bag and wishlist into an account, in one transaction.
 *
 * Inputs: what the browser holds as a guest (`guestLines`, `guestWishlist`)
 * and any server-side guest cart filed under the anonymous cookie. The
 * account's cart row is locked first, so concurrent merges and saves for the
 * same account run one after another. The policy (larger quantity per SKU,
 * then purchase limit and counted stock) makes a retry a no-op: merging the
 * same guest bag twice cannot add anything. The anonymous cart is deleted in
 * the same transaction, so it is transferred exactly once.
 */
export async function mergeIntoAccount(
  userId: string,
  anonymousId: string | null,
  guestLines: ServerCartLine[],
  guestWishlist: string[]
): Promise<MergeOutcome> {
  if (!isDatabaseConfigured()) return { lines: [], wishlist: [], adjustments: [] };

  // Stock read outside the transaction: checkout re-checks it regardless.
  const stock = await catalogueStock({ fresh: true }).catch(() => null);
  const userCartId = await resolveCartId(userId, null);
  if (!userCartId) return { lines: [], wishlist: [], adjustments: [] };

  const outcome = await db.transaction(async (tx) => {
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, userCartId)).for('update');

    const accountLines = await tx
      .select({ productId: cartItems.productId, size: cartItems.size, quantity: cartItems.quantity })
      .from(cartItems)
      .where(eq(cartItems.cartId, userCartId));

    let anonLines: ServerCartLine[] = [];
    if (anonymousId) {
      const [anonCart] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.anonymousId, anonymousId))
        .for('update');
      if (anonCart && anonCart.id !== userCartId) {
        anonLines = await tx
          .select({ productId: cartItems.productId, size: cartItems.size, quantity: cartItems.quantity })
          .from(cartItems)
          .where(eq(cartItems.cartId, anonCart.id));
        // Transferred exactly once: gone in the same commit as the merge.
        await tx.delete(carts).where(eq(carts.id, anonCart.id));
      }
    }

    // The guest's two copies (browser bag and server mirror) go in as one
    // side: within a side the larger quantity per SKU is taken, and every
    // cap and drop is reported once, here, rather than lost in a pre-merge.
    const merged = mergeCartLines(accountLines, [...guestLines, ...anonLines], stock);

    await tx.delete(cartItems).where(eq(cartItems.cartId, userCartId));
    if (merged.lines.length > 0) {
      await tx.insert(cartItems).values(merged.lines.map((l) => ({ cartId: userCartId, ...l })));
    }
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, userCartId));

    const accountWishlist = (
      await tx
        .select({ productId: wishlistItems.productId })
        .from(wishlistItems)
        .where(eq(wishlistItems.userId, userId))
        .orderBy(asc(wishlistItems.addedAt))
    ).map((r) => r.productId);
    const wishlist = mergeWishlists(accountWishlist, guestWishlist);
    const added = wishlist.filter((id) => !accountWishlist.includes(id));
    if (added.length > 0) {
      await tx
        .insert(wishlistItems)
        .values(added.map((productId) => ({ userId, productId })))
        .onConflictDoNothing();
    }

    return { lines: merged.lines, wishlist, adjustments: merged.adjustments };
  });

  await Promise.all([
    forgetCachedCart(userId, null),
    anonymousId ? forgetCachedCart(null, anonymousId) : Promise.resolve(),
    cache.invalidate(POLICIES.wishlist, userId),
  ]);
  return outcome;
}

/** Sign-in hook: folds the server-side guest cart (cookie) into the account. */
export async function mergeCarts(userId: string, anonymousId: string): Promise<void> {
  await mergeIntoAccount(userId, anonymousId, [], []);
}

/** Clears a cart once its contents have become an order. */
export async function clearCart(userId: string | null, anonymousId: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const cartId = await resolveCartId(userId, anonymousId);
  if (!cartId) return;
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await forgetCachedCart(userId, anonymousId);
}
