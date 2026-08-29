import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, getAdminConfig, verifySessionToken } from '@/lib/auth';

/**
 * Server-side gate for the admin area.
 *
 * This is the actual security boundary. The admin page also checks a client
 * flag, but only to decide what to render — that check is trivially bypassed
 * by editing localStorage, which is exactly how the previous implementation
 * could be defeated. Requests without a valid signed session never reach the
 * route at all.
 */
export async function middleware(request: NextRequest) {
  const config = getAdminConfig();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = config ? await verifySessionToken(token, config.sessionSecret) : null;

  if (session) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);

  // Clear a stale or tampered cookie on the way out.
  if (token) response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
