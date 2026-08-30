/**
 * Security policy shared by the middleware.
 *
 * A note on scraping, since it is the request that usually motivates this
 * file: a public storefront cannot be made unscrapable. Anything a browser can
 * render, a script can read, and the more aggressively you block automation the
 * more likely you are to block Googlebot and lose the organic traffic the shop
 * depends on. What is achievable is making bulk extraction slow and expensive
 * while leaving real customers and search engines untouched. That is what the
 * rules below aim at — not an impossible guarantee.
 */

/** Crawlers that must never be throttled: blocking them costs organic traffic. */
const ALLOWED_CRAWLERS = [
  'googlebot',
  'google-inspectiontool',
  'bingbot',
  'duckduckbot',
  'applebot',
  'slurp',
  'baiduspider',
  'yandexbot',
  // Link unfurlers, used when a customer shares a product.
  'twitterbot',
  'facebookexternalhit',
  'linkedinbot',
  'whatsapp',
  'slackbot',
  'telegrambot',
];

/**
 * Automation signatures with no legitimate reason to browse a storefront.
 *
 * Deliberately narrow. A broad "block anything headless" rule catches
 * accessibility tooling, uptime monitors and genuine users on unusual
 * browsers, and a determined scraper simply changes its user agent — so a wide
 * net costs real customers while barely inconveniencing the target.
 */
const BLOCKED_AGENTS = [
  'scrapy',
  'python-requests',
  'go-http-client',
  'httrack',
  'wget',
  'libwww-perl',
  'nikto',
  'sqlmap',
  'nmap',
  'masscan',
  'zgrab',
  'semrushbot',
  'ahrefsbot',
  'dotbot',
  'mj12bot',
  'petalbot',
  'dataforseobot',
];

export function isAllowedCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return ALLOWED_CRAWLERS.some((c) => ua.includes(c));
}

export function isBlockedAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua.trim()) return false; // an empty UA alone is not evidence enough
  return BLOCKED_AGENTS.some((b) => ua.includes(b));
}

/**
 * Builds the Content-Security-Policy.
 *
 * Deliberately **not** nonce-based, and it is worth recording why.
 *
 * A per-request nonce is the stronger design: it lets `script-src` drop
 * 'unsafe-inline', so an injected inline script will not execute. But a nonce
 * has to be generated per request and stamped into the HTML, which requires
 * the HTML to be produced per request. Almost every page here is statically
 * prerendered at build time — that is what makes the site fast and what put
 * the product copy in front of search engines — so there is no request to
 * derive a nonce from. Attempting it blocks every script Next emits and the
 * site renders blank.
 *
 * So this trades inline-script protection for static rendering. What the
 * policy still buys, which is most of the practical value:
 *
 *  - No script may load from a host other than this origin and Razorpay, so a
 *    stored-XSS payload cannot call out to an attacker's server.
 *  - `object-src 'none'` and `base-uri 'self'` close two common bypasses.
 *  - `form-action 'self'` stops an injected form posting data off-site.
 *  - `frame-ancestors 'none'` prevents clickjacking.
 *  - `connect-src` limits where fetch/XHR can send data.
 *
 * The remaining gap — inline execution — is mitigated by React escaping all
 * interpolated values by default. The one place that bypasses it is the
 * JSON-LD block on product pages, which serialises our own catalogue data, not
 * user input.
 *
 * If the site later moves to mostly dynamic rendering, switch this to a nonce.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is required by statically prerendered Next output; see
    // the note above. 'unsafe-eval' is dev-only, for the React refresh runtime.
    `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${
      isDev ? " 'unsafe-eval'" : ''
    }`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Unsplash for product imagery, Google for signed-in avatars.
    "img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
    'frame-src https://api.razorpay.com https://checkout.razorpay.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];

  return directives.join('; ');
}

/** Headers applied to every response. */
export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    // Denies APIs the storefront has no use for.
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    // Two years, preloadable. Only meaningful over HTTPS.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/**
 * Cross-site request forgery check for state-changing API calls.
 *
 * Server Actions carry Next's own origin check, but route handlers do not, so
 * a POST from another site would otherwise be accepted with the visitor's
 * cookies attached. Compares Origin against Host rather than trusting a custom
 * header, since Origin is one of the few values a page cannot forge.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  // Same-origin form posts and server-to-server calls may omit Origin.
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get('host');
    return Boolean(host) && originHost === host;
  } catch {
    return false;
  }
}
