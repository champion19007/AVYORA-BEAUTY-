import { sql } from 'drizzle-orm';
import { reportError } from '@/lib/observability';
import { db, isDatabaseConfigured } from '@/db';

/**
 * Fixed-window rate limiting.
 *
 * Nothing was rate limited before: the admin login could be brute-forced and
 * checkout could be driven in a loop to create unlimited orders.
 *
 * Counters live in Postgres rather than process memory. On serverless, an
 * in-memory counter resets on every cold start and is not shared between
 * instances, so attempts spread across instances would never reach a limit.
 * Redis is faster and is the natural upgrade after the AWS move — this
 * interface would not change.
 *
 * The whole check is a single atomic statement. Read-then-write would let two
 * concurrent requests both observe "under the limit" and both proceed.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /** Admin sign-in: deliberately tight, this guards the operator credential. */
  adminLogin: { limit: 5, windowSeconds: 900 },
  /** Order placement, keyed by IP. */
  checkout: { limit: 10, windowSeconds: 600 },
  /** Payment session creation. */
  payment: { limit: 15, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Best-effort client address.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded headers
 * are used. These are client-controllable in general, but on Vercel and behind
 * an ALB the edge overwrites them, which is what makes them usable here.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * How long the counter query may take before the request is let through.
 *
 * Middleware awaits this on every page view, so an unbounded query is an
 * unbounded page load. Failing open on *errors* is not enough: a database that
 * accepts the connection and then never answers — a restarted container
 * holding a dead socket, a saturated pool — is not an error, it is a hang, and
 * without this bound it takes the entire site down. Ask any user which they
 * prefer: unlimited requests, or a shop that never renders.
 */
const RATE_LIMIT_TIMEOUT_MS = 1000;

/**
 * Consumes one unit from a bucket.
 *
 * Fails **open** in every failure mode: no database configured, a query error,
 * or a query that exceeds RATE_LIMIT_TIMEOUT_MS. A rate limiter that takes
 * checkout down when the counter table hiccups causes more damage than the
 * abuse it prevents.
 */
export async function rateLimit(
  bucket: keyof typeof RATE_LIMITS,
  identifier: string,
  rule: RateLimitRule = RATE_LIMITS[bucket]
): Promise<RateLimitResult> {
  const allowedResult: RateLimitResult = {
    allowed: true,
    remaining: rule.limit,
    retryAfterSeconds: 0,
  };

  if (!isDatabaseConfigured()) return allowedResult;

  const key = `${bucket}:${identifier}`;

  // Resolves to null if the query outruns its budget, so the caller proceeds.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RATE_LIMIT_TIMEOUT_MS);
  });

  try {
    // Upsert-and-count atomically: start a new window if the old one has
    // expired, otherwise increment. The returned count is authoritative.
    const query = db.execute<{ count: number; window_start: Date }>(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN rate_limits.window_start < now() - (${rule.windowSeconds} || ' seconds')::interval
            THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < now() - (${rule.windowSeconds} || ' seconds')::interval
            THEN now()
          ELSE rate_limits.window_start
        END
      RETURNING count, window_start
    `);

    const rows = await Promise.race([query, budget]);

    // Timed out. Let the request through rather than making the visitor wait
    // on a counter; the query is left to settle on its own.
    if (rows === null) {
      reportError(new Error(`Rate limit query exceeded ${RATE_LIMIT_TIMEOUT_MS}ms`), {
        scope: 'rateLimit',
        extra: { bucket, timedOut: true },
      });
      return allowedResult;
    }

    const row = (rows as unknown as { count: number; window_start: Date }[])[0];
    if (!row) return allowedResult;

    const count = Number(row.count);
    const windowStart = new Date(row.window_start).getTime();
    const elapsed = Math.floor((Date.now() - windowStart) / 1000);
    const retryAfterSeconds = Math.max(1, rule.windowSeconds - elapsed);

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  } catch (err) {
    reportError(err, { scope: 'rateLimit', extra: { bucket } });
    return allowedResult;
  } finally {
    // Without this the pending timer keeps the event loop alive on every call.
    clearTimeout(timer);
  }
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds),
    },
  });
}
