import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSameOrigin } from '@/lib/security';
import { getWishlist, setWishlist } from '@/modules/wishlist/wishlist';

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

  let productIds: unknown;
  try {
    productIds = (await request.json())?.productIds;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!Array.isArray(productIds)) {
    return NextResponse.json({ error: 'productIds must be a list.' }, { status: 400 });
  }

  const stored = await setWishlist(
    userId,
    productIds.filter((id): id is string => typeof id === 'string')
  );
  return NextResponse.json({ signedIn: true, stored: true, productIds: stored });
}
