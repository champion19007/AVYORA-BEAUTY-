/**
 * A path on this site to go to after signing in, or `fallback`.
 *
 * Checking the raw string ("starts with / but not //") is not enough: the
 * browser reads `/\evil.com` and `/<tab>/evil.com` as `//evil.com`. So the
 * value is resolved the way the browser will resolve it, and kept only if it
 * stays on the same origin.
 */
export function sameSitePath(requested: string | null | undefined, fallback = '/account'): string {
  if (!requested?.startsWith('/')) return fallback;
  const base = 'http://same.invalid';
  try {
    const url = new URL(requested, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
