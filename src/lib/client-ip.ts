/**
 * The client's address, from the deployment's verified proxy only.
 *
 * Forwarded headers are client-controlled unless a proxy in front of the app
 * overwrites them. Vercel does: it replaces `x-forwarded-for` with the
 * connecting address and does not forward external values
 * (vercel.com/docs/headers/request-headers). So the header is trusted only
 * when running on Vercel, or when `TRUSTED_PROXY=x-forwarded-for` declares
 * another proxy that overwrites it (an ALB, CloudFront). Anywhere else
 * (local development, an unknown host) the answer is null: an attacker can
 * write any address into those headers, and a limiter keyed on them could
 * be dodged per request or aimed at someone else.
 *
 * Edge-safe: no Node APIs, so middleware can use it too.
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;

export type ProxyMode = 'vercel' | 'x-forwarded-for' | 'none';

export function proxyMode(env: Record<string, string | undefined> = process.env): ProxyMode {
  if (env.TRUSTED_PROXY === 'x-forwarded-for') return 'x-forwarded-for';
  if (env.TRUSTED_PROXY === 'none') return 'none';
  return env.VERCEL === '1' ? 'vercel' : 'none';
}

/** A syntactically valid address from the trusted header, or null. */
export function trustedClientIp(headers: Headers, mode: ProxyMode = proxyMode()): string | null {
  if (mode === 'none') return null;
  // The proxy writes the connecting address first.
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return IPV4.test(first) || (first.includes(':') && IPV6.test(first)) ? first.toLowerCase() : null;
}
