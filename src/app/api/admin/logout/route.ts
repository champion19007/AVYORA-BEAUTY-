import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { isSameOrigin } from '@/lib/security';

/** Clears the admin session cookie. Same-origin only, so another site cannot sign staff out. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
