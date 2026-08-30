import { and, eq, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { carts, cartItems } from '@/db/schema';

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
  const [existing] = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(carts)
    .values({ userId: userId ?? null, anonymousId: userId ? null : anonymousId })
    .returning({ id: carts.id });

  return created?.id ?? null;
}

/** Replaces the stored cart with exactly these lines. */
export async function saveCart(
  lines: ServerCartLine[],
  userId: string | null,
  anonymousId: string | null
): Promise<void> {
  const cartId = await resolveCartId(userId, anonymousId);
  if (!cartId) return;

  await db.transaction(async (tx) => {
    await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));

    if (lines.length > 0) {
      await tx.insert(cartItems).values(
        lines
          .filter((l) => l.quantity > 0)
          .map((l) => ({
            cartId,
            productId: l.productId,
            size: l.size,
            quantity: l.quantity,
          }))
      );
    }

    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  });
}

/** Reads the stored cart. */
export async function loadCart(
  userId: string | null,
  anonymousId: string | null
): Promise<ServerCartLine[]> {
  if (!isDatabaseConfigured()) return [];
  if (!userId && !anonymousId) return [];

  const where = userId ? eq(carts.userId, userId) : eq(carts.anonymousId, anonymousId!);
  const [cart] = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  if (!cart) return [];

  const items = await db
    .select({
      productId: cartItems.productId,
      size: cartItems.size,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  return items;
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
}

/** Clears a cart once its contents have become an order. */
export async function clearCart(userId: string | null, anonymousId: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const cartId = await resolveCartId(userId, anonymousId);
  if (!cartId) return;
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}
