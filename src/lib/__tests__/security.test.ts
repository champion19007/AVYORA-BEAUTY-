import { describe, it, expect } from 'vitest';
import {
  isAllowedCrawler,
  isBlockedAgent,
  isSameOrigin,
  contentSecurityPolicy,
  securityHeaders,
} from '../security';

describe('crawler allowlist', () => {
  it('recognises the search engines that matter', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'DuckDuckBot/1.1',
      'Applebot/0.1',
    ]) {
      expect(isAllowedCrawler(ua)).toBe(true);
    }
  });

  it('recognises link unfurlers, so shared products still preview', () => {
    for (const ua of ['facebookexternalhit/1.1', 'WhatsApp/2.19', 'Twitterbot/1.0', 'Slackbot 1.0']) {
      expect(isAllowedCrawler(ua)).toBe(true);
    }
  });

  it('does not mistake an ordinary browser for a crawler', () => {
    expect(
      isAllowedCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120')
    ).toBe(false);
  });
});

describe('blocked agents', () => {
  it('catches scrapers and scanners', () => {
    for (const ua of ['Scrapy/2.11', 'python-requests/2.31', 'sqlmap/1.7', 'Wget/1.21', 'nikto']) {
      expect(isBlockedAgent(ua)).toBe(true);
    }
  });

  it('leaves real browsers alone', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/121.0',
    ]) {
      expect(isBlockedAgent(ua)).toBe(false);
    }
  });

  it('does not block on an empty user agent alone', () => {
    // Some privacy tools and corporate proxies strip it; that is not evidence
    // enough to refuse a customer.
    expect(isBlockedAgent('')).toBe(false);
    expect(isBlockedAgent('   ')).toBe(false);
  });

  it('never blocks something the allowlist also matches', () => {
    // A rule change must not be able to deindex the shop.
    const crawlers = ['Googlebot/2.1', 'bingbot/2.0', 'Applebot/0.1'];
    for (const ua of crawlers) {
      expect(isAllowedCrawler(ua) && isBlockedAgent(ua)).toBe(false);
    }
  });
});

describe('same-origin check', () => {
  const req = (headers: Record<string, string>) => new Request('https://avyora.com/api/cart', { headers });

  it('accepts a matching origin', () => {
    expect(isSameOrigin(req({ origin: 'https://avyora.com', host: 'avyora.com' }))).toBe(true);
  });

  it('rejects a cross-site origin', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'avyora.com' }))).toBe(false);
  });

  it('rejects a lookalike subdomain', () => {
    expect(
      isSameOrigin(req({ origin: 'https://avyora.com.evil.example', host: 'avyora.com' }))
    ).toBe(false);
  });

  it('rejects a malformed origin rather than throwing', () => {
    expect(isSameOrigin(req({ origin: 'not a url', host: 'avyora.com' }))).toBe(false);
  });

  it('allows a request with no Origin header', () => {
    // Same-origin form posts and server-to-server calls legitimately omit it.
    expect(isSameOrigin(req({ host: 'avyora.com' }))).toBe(true);
  });
});

describe('content security policy', () => {
  const csp = contentSecurityPolicy(false);

  it('confines scripts to this origin and the payment provider', () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com");
    // A stored-XSS payload must not be able to load from an attacker's host.
    expect(csp).not.toContain('script-src *');
  });

  it('closes the common bypasses', () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('only permits eval in development', () => {
    expect(contentSecurityPolicy(false)).not.toContain('unsafe-eval');
    expect(contentSecurityPolicy(true)).toContain('unsafe-eval');
  });

  it('restricts where data can be sent', () => {
    expect(csp).toContain("connect-src 'self' https://api.razorpay.com");
  });
});

describe('security headers', () => {
  const headers = securityHeaders();

  it('sets the headers a scanner will look for', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });

  it('sets an HSTS max-age of at least a year', () => {
    const maxAge = Number(headers['Strict-Transport-Security'].match(/max-age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });
});
