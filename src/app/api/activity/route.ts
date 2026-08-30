import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { ANONYMOUS_COOKIE } from '@/lib/cart-server';
import { recordEvent, type EventName } from '@/lib/activity';
import { isSameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

const ALLOWED: ReadonlySet<string> = new Set<EventName>([
  'product_viewed',
  'product_added_to_cart',
  'cart_viewed',
  'checkout_started',
  'order_placed',
  'routine_completed',
  'search_performed',
]);

/**
 * Records a behavioural event.
 *
 * The event name is checked against an allowlist so the table cannot be filled
 * with arbitrary names from the browser, and it always returns 204 — analytics
 * must never surface an error to a customer mid-journey.
 */
export async function POST(request: Request) {
  // Cross-origin posts are dropped silently: analytics should never tell a
  // caller anything about itself.
  if (!isSameOrigin(request) || !isDatabaseConfigured()) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = await request.json();
    if (!ALLOWED.has(body?.name)) return new NextResponse(null, { status: 204 });

    const session = await auth().catch(() => null);
    const anon = (await cookies()).get(ANONYMOUS_COOKIE)?.value ?? null;

    await recordEvent({
      name: body.name,
      props: body.props,
      path: body.path,
      userId: session?.user?.id ?? null,
      anonymousId: anon,
    });
  } catch {
    // Swallowed deliberately.
  }

  return new NextResponse(null, { status: 204 });
}
