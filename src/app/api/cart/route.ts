import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/security';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { ANONYMOUS_COOKIE, loadCart, saveCart, type ServerCartLine } from '@/lib/cart-server';

export const dynamic = 'force-dynamic';

/** Anonymous visitors get a stable id so their cart can be stored and later merged. */
async function anonymousId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(ANONYMOUS_COOKIE)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  jar.set(ANONYMOUS_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
  return id;
}

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ lines: [] });

  const session = await auth().catch(() => null);
  const anon = await anonymousId();
  const lines = await loadCart(session?.user?.id ?? null, anon);
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

  let lines: ServerCartLine[];
  try {
    const body = await request.json();
    lines = Array.isArray(body?.lines) ? body.lines : [];
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const clean = lines
    .filter(
      (l) =>
        typeof l?.productId === 'string' &&
        typeof l?.size === 'string' &&
        Number.isInteger(l?.quantity)
    )
    .map((l) => ({
      productId: l.productId.slice(0, 100),
      size: l.size.slice(0, 40),
      quantity: Math.min(Math.max(l.quantity, 0), 20),
    }))
    .slice(0, 100);

  const session = await auth().catch(() => null);
  const anon = await anonymousId();

  try {
    await saveCart(clean, session?.user?.id ?? null, anon);
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    // Cart mirroring must never break the shop.
    console.error('cart sync failed (ignored)', err);
    return NextResponse.json({ ok: true, stored: false });
  }
}
