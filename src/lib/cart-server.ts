import { eq, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { carts, cartItems } from '@/db/schema';
import { cache, POLICIES } from '@/infrastructure/cache';

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
 * recovered and analysed. The two are reconciled by `mergeCarts` at sign-in,
 * taking the larger quantity for any line present in both, since a customer
 * removing something is rarer than adding on a second device.
 */

export type ServerCartLine = { productId: string; size: string; quantity: number };

export const ANONYMOUS_COOKIE = 'avyora_cart_id';

/** Finds or creates the cart for a signed-in user or an anonymous visitor. */
async function resolveCartId(
  userId: string | null,
  anonymousId: string | null
): Promise<string | null> {
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
    if (line.quantity <= 0) continue;
    const key = `${line.productId}::${line.size}`;
    const existing = merged.get(key);
    merged.set(key, {
      ...line,
      quantity: Math.min((existing?.quantity ?? 0) + line.quantity, 20),
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
      await tx.insert(cartItems).values(
        clean.map((l) => ({ cartId, productId: l.productId, size: l.size, quantity: l.quantity }))
      );
    }

    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  });

  // After the commit, never before: a reader between the two would otherwise
  // refill the cache from the old rows.
  await forgetCachedCart(userId, anonymousId);
}

/** Reads the stored cart. */
export async function loadCart(
  userId: string | null,
  anonymousId: string | null
): Promise<ServerCartLine[]> {
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

/**
 * Folds an anonymous cart into the user's cart at sign-in.
 *
 * Without this, a visitor who fills a basket and then signs in to pay would
 * watch it empty — the most expensive possible moment to lose a cart.
 */
export async function mergeCarts(userId: string, anonymousId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const [anonCart] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.anonymousId, anonymousId))
    .limit(1);
  if (!anonCart) return;

  const userCartId = await resolveCartId(userId, null);
  if (!userCartId || userCartId === anonCart.id) return;

  const anonItems = await db.select().from(cartItems).where(eq(cartItems.cartId, anonCart.id));

  await db.transaction(async (tx) => {
    for (const item of anonItems) {
      await tx
        .insert(cartItems)
        .values({
          cartId: userCartId,
          productId: item.productId,
          size: item.size,
          quantity: item.quantity,
        })
        // Same product and size in both carts: keep the larger quantity rather
        // than summing, so signing in twice cannot inflate the basket.
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.productId, cartItems.size],
          set: { quantity: sql`greatest(${cartItems.quantity}, ${item.quantity})` },
        });
    }

    await tx.delete(carts).where(eq(carts.id, anonCart.id));
  });

  await Promise.all([forgetCachedCart(userId, null), forgetCachedCart(null, anonymousId)]);
}

/** Clears a cart once its contents have become an order. */
export async function clearCart(userId: string | null, anonymousId: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const cartId = await resolveCartId(userId, anonymousId);
  if (!cartId) return;
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await forgetCachedCart(userId, anonymousId);
}
