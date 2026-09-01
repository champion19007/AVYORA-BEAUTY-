/**
 * In-memory rate limiting for Edge middleware.
 *
 * The Postgres-backed limiter in `rate-limit.ts` cannot run here. Middleware
 * executes in the Edge runtime, which has no TCP sockets, so the `postgres`
 * driver fails on every call — it spent its life throwing "Failed query" into
 * the logs and failing open, and after a database restart it stopped failing
 * fast and started *hanging*, taking the whole storefront down with it.
 *
 * So this is deliberately dumber and entirely local: a counter in the
 * isolate's memory. That has real limits, and they are worth stating plainly:
 *
 *   - State is per isolate. Serverless platforms run many, and each keeps its
 *     own tally, so the effective limit is the configured one multiplied by
 *     however many isolates are warm.
 *   - A cold start resets it.
 *
 * It is therefore a speed bump against a single client hammering one instance,
 * not a defence against a distributed pull. The real answer for bulk scraping
 * is the CDN/WAF layer in front of the app — see `docs/waf.md`. What it does
 * guarantee, which the database version did not, is that it can never be slow
 * and can never take the site down.
 *
 * Anything that must actually be enforced — admin sign-in, checkout, payment
 * creation — uses the durable Postgres limiter from a Node-runtime handler,
 * where the driver works and the count is shared across instances.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/**
 * Cap on tracked keys.
 *
 * Without one, a stream of spoofed forwarded-for values would grow the map
 * until the isolate ran out of memory — turning a rate limiter into the
 * denial-of-service it exists to prevent.
 */
const MAX_KEYS = 10_000;

export type EdgeRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Consumes one unit from an in-memory fixed window.
 *
 * Synchronous by design: there is nothing to await, so middleware cannot block
 * on it.
 */
export function edgeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): EdgeRateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    // Evict expired entries before admitting a new key, so the map cannot
    // grow without bound under a spray of one-off addresses.
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) {
        if (now - v.windowStart >= windowMs) buckets.delete(k);
      }
      // Still full: every entry is live. Let the request through rather than
      // punishing an arbitrary visitor for the map being busy.
      if (buckets.size >= MAX_KEYS) return { allowed: true, retryAfterSeconds: 0 };
    }

    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    const elapsed = Math.floor((now - existing.windowStart) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, windowSeconds - elapsed) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam: drops all counters. */
export function resetEdgeRateLimits(): void {
  buckets.clear();
}
