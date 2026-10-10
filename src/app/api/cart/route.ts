import { NextResponse } from 'next/server';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { accountKey, ANONYMOUS_COOKIE, loadCart, saveCart, type ServerCartLine } from '@/lib/cart-server';
import { reportError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** Anonymous visitors get a stable id so their cart can be stored and later merged. */
async function anonymousId(): Promise<string> {
  return (await anonymousIdentity()).id;
}

/** The visitor's id, and whether it was minted just now. */
async function anonymousIdentity(): Promise<{ id: string; fresh: boolean }> {
  const jar = await cookies();
  const existing = jar.get(ANONYMOUS_COOKIE)?.value;
  if (existing) return { id: existing, fresh: false };

  const id = crypto.randomUUID();
  jar.set(ANONYMOUS_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
  return { id, fresh: true };
}

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ lines: [] });

  const session = await auth().catch(() => null);
  const anon = await anonymousIdentity();

  // An id minted on this request cannot have a cart yet: every new visitor's
  // first page load, answered without touching the database.
  if (!session?.user?.id && anon.fresh) return NextResponse.json({ lines: [] });

  const lines = await loadCart(session?.user?.id ?? null, anon.id);
  return NextResponse.json({ lines });
}

/**
 * Mirrors the browser's cart to the server.
 *
 * Only ids, sizes and quantities are accepted — never prices. The stored cart
 * is a record of intent; what anything costs is resolved from the catalogue at
 * checkout.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  if (!isDatabaseConfigured()) return NextResponse.json({ ok: true, stored: false });

  const read = await readBoundedJson(request, BODY_LIMITS.cart);
  if (!read.ok) return read.response;
  const body = read.json as { lines?: unknown; accountKey?: unknown } | undefined;
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  // A bag holds one line per SKU; anything longer is not a real bag.
  if (Array.isArray(body.lines) && body.lines.length > 50) {
    return NextResponse.json({ error: 'Too many lines.' }, { status: 413 });
  }
  const lines: ServerCartLine[] = Array.isArray(body.lines) ? body.lines : [];

  const clean = lines
    .filter((l) => typeof l?.productId === 'string' && typeof l?.size === 'string' && Number.isInteger(l?.quantity))
    .map((l) => ({
      productId: l.productId.slice(0, 100),
      size: l.size.slice(0, 40),
      quantity: Math.min(Math.max(l.quantity, 0), 20),
    }))
    .slice(0, 100);

  const session = await auth().catch(() => null);

  // The browser says whose bag this is. If that is not who is signed in now
  // (a tab left open across a sign-out, or another account signed in), the
  // save is refused rather than written into the wrong account's cart.
  const expected = session?.user?.id ? accountKey(session.user.id) : null;
  if (body.accountKey !== undefined && body.accountKey !== expected) {
    return NextResponse.json(
      { error: 'Account changed.', code: 'account_changed', accountKey: expected },
      { status: 409 }
    );
  }

  const anon = await anonymousId();

  try {
    await saveCart(clean, session?.user?.id ?? null, anon);
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    // Cart mirroring must never break the shop.
    reportError(err, { scope: 'cart.sync' });
    return NextResponse.json({ ok: true, stored: false });
  }
}
