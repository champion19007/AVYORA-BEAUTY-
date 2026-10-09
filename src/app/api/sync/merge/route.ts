import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { isSameOrigin } from '@/lib/security';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { accountKey, ANONYMOUS_COOKIE, mergeIntoAccount } from '@/lib/cart-server';
import { normaliseLines } from '@/lib/cart';
import type { MergeAdjustment } from '@/lib/cart-merge';
import { reportError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export type MergeResponse = {
  accountKey: string;
  cart: { productId: string; size: string; quantity: number }[];
  wishlist: string[];
  adjustments: MergeAdjustment[];
};

/**
 * Folds the browser's guest bag and wishlist into the signed-in account.
 *
 * Signed-in only, same-origin only, bounded body. The guest's lines are
 * validated with the same rules as the bag (known SKUs, positive whole
 * quantities, purchase limit); prices are never accepted. Safe to retry: the
 * merge policy keeps the larger quantity per SKU, so a repeated request
 * cannot add anything.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Sign in first.', code: 'not_signed_in' }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });

  const read = await readBoundedJson(request, BODY_LIMITS.cart);
  if (!read.ok) return read.response;
  const body = read.json as { lines?: unknown; wishlist?: unknown } | undefined;
  const lines = normaliseLines({ version: 2, lines: Array.isArray(body?.lines) ? body.lines.slice(0, 50) : [] });
  const wishlist = Array.isArray(body?.wishlist)
    ? body.wishlist.filter((id): id is string => typeof id === 'string').slice(0, 100)
    : [];

  const anonymousId = (await cookies()).get(ANONYMOUS_COOKIE)?.value ?? null;
  try {
    const outcome = await mergeIntoAccount(userId, anonymousId, lines, wishlist);
    return NextResponse.json({
      accountKey: accountKey(userId),
      cart: outcome.lines,
      wishlist: outcome.wishlist,
      adjustments: outcome.adjustments,
    } satisfies MergeResponse);
  } catch (err) {
    reportError(err, { scope: 'cart.merge' });
    // The browser keeps the guest bag and retries later; nothing is lost.
    return NextResponse.json({ error: 'Could not merge your bag right now.' }, { status: 503 });
  }
}
