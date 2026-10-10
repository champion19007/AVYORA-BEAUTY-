import { NextResponse } from 'next/server';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { auth } from '@/auth';
import { isSameOrigin } from '@/lib/security';
import { getWishlist, setWishlist } from '@/modules/wishlist/wishlist';
import { accountKey } from '@/lib/cart-server';

export const dynamic = 'force-dynamic';

/**
 * The signed-in customer's wishlist.
 *
 * Anonymous visitors get `signedIn: false` and keep their list in the browser
 * alone; there is no account to attach it to. The user id always comes from the
 * session, never from the request, so nobody can read or replace someone
 * else's list.
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ signedIn: false, productIds: [] });

  return NextResponse.json({ signedIn: true, productIds: await getWishlist(userId) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ signedIn: false, stored: false });

  const read = await readBoundedJson(request, BODY_LIMITS.wishlist);
  if (!read.ok) return read.response;
  const body = read.json as { productIds?: unknown; accountKey?: unknown } | undefined;
  // Same guard as the bag: never write one account's list into another's.
  if (body?.accountKey !== undefined && body.accountKey !== accountKey(userId)) {
    return NextResponse.json(
      { error: 'Account changed.', code: 'account_changed', accountKey: accountKey(userId) },
      { status: 409 }
    );
  }
  const productIds = body?.productIds;
  if (!Array.isArray(productIds)) {
    return NextResponse.json({ error: 'productIds must be a list.' }, { status: 400 });
  }
  if (productIds.length > 100) {
    return NextResponse.json({ error: 'Too many products.' }, { status: 413 });
  }

  const stored = await setWishlist(
    userId,
    productIds.filter((id): id is string => typeof id === 'string')
  );
  return NextResponse.json({ signedIn: true, stored: true, productIds: stored });
}
