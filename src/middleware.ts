import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, getAdminConfig, verifySessionToken } from '@/lib/auth';
import {
  contentSecurityPolicy,
  isAllowedCrawler,
  isBlockedAgent,
  securityHeaders,
} from '@/lib/security';
import { edgeRateLimit } from '@/lib/edge-rate-limit';

/**
 * Edge middleware: security headers, bot mitigation, and the admin gate.
 *
 * It runs on every request that is not a static asset. The matcher at the
 * bottom excludes `_next/static`, images and the like, because adding headers
 * to immutable assets costs latency on every page for no benefit.
 */

/** Requests per minute for an ordinary visitor. Generous; this targets bulk pulls. */
const BROWSE_LIMIT = { limit: 120, windowSeconds: 60 };

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const path = request.nextUrl.pathname;

  /* ----------------------------------------------------- bot mitigation --- */

  // Known scrapers and vulnerability scanners. Search engines are checked
  // first so a rule change can never accidentally deindex the shop.
  if (!isAllowedCrawler(userAgent) && isBlockedAgent(userAgent)) {
    return new NextResponse('Not available', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Throttle bulk browsing. Search engines are exempt, since crawling fast is
  // their job and blocking them costs organic traffic.
  //
  // Counted in memory, not in Postgres: the driver cannot open a socket from
  // the Edge runtime, so the database-backed limiter failed on every request
  // here and — once it started hanging instead of erroring — took the site
  // down. See lib/edge-rate-limit.ts for what this does and does not promise.
  if (!isAllowedCrawler(userAgent) && !path.startsWith('/api/')) {
    const browse = edgeRateLimit(
      `browse:${clientAddress(request)}`,
      BROWSE_LIMIT.limit,
      BROWSE_LIMIT.windowSeconds
    );
    if (!browse.allowed) {
      return new NextResponse('Too many requests', {
        status: 429,
        headers: {
          'Retry-After': String(browse.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  /* ------------------------------------------------------------- admin --- */

  // Exact segment match, not a prefix: `startsWith('/admin')` also matches
  // `/admin-login`, which made the operator login page redirect to itself.
  if (path === '/admin' || path.startsWith('/admin/')) {
    const config = getAdminConfig();
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = config ? await verifySessionToken(token, config.sessionSecret) : null;

    if (!session) {
      // The operator entrance, not the customer one.
      const loginUrl = new URL('/admin-login', request.url);
      loginUrl.searchParams.set('next', path);
      const redirect = NextResponse.redirect(loginUrl);
      if (token) redirect.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
      return redirect;
    }
  }

  /* ----------------------------------------------------------- headers --- */

  const isDev = process.env.NODE_ENV !== 'production';
  const response = NextResponse.next();

  response.headers.set('Content-Security-Policy', contentSecurityPolicy(isDev));
  for (const [key, value] of Object.entries(securityHeaders())) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the image optimiser. Those are
     * immutable and cached at the edge; running middleware on them would add
     * latency to every page load for no security benefit.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|logo.*\\.png|og-image\\.jpg|icon\\.png).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
