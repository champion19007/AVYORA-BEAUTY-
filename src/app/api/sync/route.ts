import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { accountKey, loadCart } from '@/lib/cart-server';
import { getWishlist } from '@/modules/wishlist/wishlist';

export const dynamic = 'force-dynamic';

export type SyncState = {
  /** Opaque key of the signed-in account, or null for a guest. */
  accountKey: string | null;
  /** The account's stored bag and wishlist; null for a guest (their state lives in the browser). */
  cart: { productId: string; size: string; quantity: number }[] | null;
  wishlist: string[] | null;
};

/**
 * Who this browser is, and the account's saved bag and wishlist.
 *
 * The account comes from the session only, never from the request, so a
 * caller can only ever read their own state. A guest gets nothing back and
 * costs no database read.
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId || !isDatabaseConfigured()) {
    return NextResponse.json({ accountKey: null, cart: null, wishlist: null } satisfies SyncState);
  }
  const [cart, wishlist] = await Promise.all([loadCart(userId, null), getWishlist(userId)]);
  return NextResponse.json({ accountKey: accountKey(userId), cart, wishlist } satisfies SyncState);
}
