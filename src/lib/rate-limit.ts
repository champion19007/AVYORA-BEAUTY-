import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { reportError } from '@/lib/observability';
import { db as defaultDb, isDatabaseConfigured } from '@/db';

/**
 * Durable, shared fixed-window rate limiting.
 *
 * Counters live in Postgres (`rate_limits`), never only in process memory: a
 * serverless instance's memory is neither shared nor durable, so a quota
 * held there is no quota. Every check is one atomic statement over all of
 * its keys (a multi-row upsert, keys sorted to avoid deadlocks), so
 * concurrent requests on any number of instances cannot both see "under".
 *
 * Each policy declares what happens when the counter cannot be reached:
 * `closed` refuses (503) for costly or credential-sensitive work; `open`
 * lets cheap, cached reads through. Nothing silently bypasses a closed
 * policy any more: the old in-memory fallback and fail-open on error are gone.
 *
 * Keys never contain a raw address or identifier: they are keyed HMACs
 * (`RATE_LIMIT_KEY_SECRET`, falling back to `AUTH_SECRET`). Rotating that
 * secret starts every window afresh.
 *
 * Limits are starting settings from the specification (section 21), to be
 * tuned from real traffic. `RATE_LIMIT_OVERRIDES` (JSON) changes any of them
 * per deployment without a code change.
 */

export type LimitPolicy = {
  /** Requests per window for an account, guest owner or identifier. */
  limit: number;
  /**
   * Requests per window for one IP address. Higher than `limit` where people
   * may share an address (mobile carriers, offices): IP is a secondary signal.
   */
  ipLimit: number;
  windowSeconds: number;
  /** When the counter is unavailable: refuse (`closed`) or allow (`open`). */
  onFailure: 'closed' | 'open';
};

const DEFAULT_POLICIES = {
  /** Customer sign-in and code checks: per identity and per IP. */
  login: { limit: 10, ipLimit: 30, windowSeconds: 600, onFailure: 'closed' },
  /** Operator sign-in. */
  adminLogin: { limit: 5, ipLimit: 5, windowSeconds: 900, onFailure: 'closed' },
  /** Sending a one-time code: per identifier, and per IP (spec: 5). */
  otpSend: { limit: 3, ipLimit: 5, windowSeconds: 900, onFailure: 'closed' },
  /** At most one code per identifier per minute. */
  otpResend: { limit: 1, ipLimit: 1_000, windowSeconds: 60, onFailure: 'closed' },
  /** "Does this account exist?" and order tracking: guessing surfaces. */
  accountLookup: { limit: 20, ipLimit: 20, windowSeconds: 60, onFailure: 'closed' },
  checkout: { limit: 10, ipLimit: 10, windowSeconds: 600, onFailure: 'closed' },
  payment: { limit: 15, ipLimit: 15, windowSeconds: 600, onFailure: 'closed' },
  /** Batch availability and price quotes; cached, so cheap to allow on outage. */
  catalogBatch: { limit: 60, ipLimit: 60, windowSeconds: 60, onFailure: 'open' },
  routineSaveMinute: { limit: 5, ipLimit: 30, windowSeconds: 60, onFailure: 'closed' },
  routineSaveDay: { limit: 20, ipLimit: 200, windowSeconds: 86_400, onFailure: 'closed' },
  feedback: { limit: 5, ipLimit: 30, windowSeconds: 3_600, onFailure: 'closed' },
  /** Reading and deleting saved routines; cheap, so allowed on outage. */
  routineRead: { limit: 60, ipLimit: 120, windowSeconds: 60, onFailure: 'open' },
  /** Granting or withdrawing consent (a guest grant issues the owner cookie). */
  consent: { limit: 10, ipLimit: 30, windowSeconds: 600, onFailure: 'closed' },
  scanStatus: { limit: 20, ipLimit: 60, windowSeconds: 60, onFailure: 'closed' },
  /** Support requests from the consultation form: per email and per IP. */
  support: { limit: 3, ipLimit: 10, windowSeconds: 3_600, onFailure: 'closed' },
  /** Review submissions, per account and per IP. */
  review: { limit: 5, ipLimit: 20, windowSeconds: 3_600, onFailure: 'closed' },
  /** Newsletter sign-up and confirmation (double opt-in). */
  newsletter: { limit: 3, ipLimit: 10, windowSeconds: 3_600, onFailure: 'closed' },
  /** Staff publish and bulk jobs, per staff user. */
  staffPublish: { limit: 5, ipLimit: 30, windowSeconds: 60, onFailure: 'closed' },
} as const satisfies Record<string, LimitPolicy>;

export type PolicyName = keyof typeof DEFAULT_POLICIES;

const overrideSchema = z.record(
  z.string(),
  z
    .object({
      limit: z.number().int().positive(),
      ipLimit: z.number().int().positive(),
      windowSeconds: z
        .number()
        .int()
        .positive()
        .max(31 * 86_400),
      onFailure: z.enum(['closed', 'open']),
    })
    .partial()
    .strict()
);

/** Policies with any valid `RATE_LIMIT_OVERRIDES` applied. Invalid overrides are ignored and reported. */
export function loadPolicies(
  raw: string | undefined = process.env.RATE_LIMIT_OVERRIDES
): Record<PolicyName, LimitPolicy> {
  const policies: Record<string, LimitPolicy> = { ...DEFAULT_POLICIES };
  if (!raw) return policies as Record<PolicyName, LimitPolicy>;
  try {
    const parsed = overrideSchema.parse(JSON.parse(raw));
    for (const [name, patch] of Object.entries(parsed)) {
      if (name in policies) policies[name] = { ...policies[name], ...patch };
    }
  } catch (err) {
    reportError(err, { scope: 'rateLimit.overrides' });
  }
  return policies as Record<PolicyName, LimitPolicy>;
}

export const POLICIES = loadPolicies();

/** Who a check is about. `ip` subjects use the policy's `ipLimit`. */
export type Subject =
  | { kind: 'user'; id: string }
  | { kind: 'guest'; ownerHash: string }
  | { kind: 'identifier'; value: string }
  | { kind: 'ip'; address: string | null };

export type LimitCheck = { policy: PolicyName; subject: Subject };

export type LimitResult =
  | { allowed: true; remaining: number; retryAfterSeconds: 0 }
  | { allowed: false; reason: 'limited' | 'unavailable'; retryAfterSeconds: number };

function keySecret(): string {
  return process.env.RATE_LIMIT_KEY_SECRET || process.env.AUTH_SECRET || 'development-only-rate-limit-key';
}

/** Lowercased, trimmed, inner whitespace removed: "  A@B.com " and "a@b.com" are one identifier. */
export function normaliseIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** Keyed hash of an identifier or address, for any stored key. Never the raw value. */
export function keyedHash(raw: string, secret = keySecret()): string {
  return createHmac('sha256', secret).update(raw).digest('base64url').slice(0, 32);
}

/** The stored key for a check, or null when the subject cannot be keyed (no trusted IP). */
export function limiterKey(policy: PolicyName, subject: Subject, secret = keySecret()): string | null {
  const raw =
    subject.kind === 'user'
      ? `u:${subject.id}`
      : subject.kind === 'guest'
        ? `g:${subject.ownerHash}`
        : subject.kind === 'identifier'
          ? `i:${normaliseIdentifier(subject.value)}`
          : subject.address
            ? `ip:${subject.address}`
            : null;
  if (!raw) return null;
  return `${policy}:${keyedHash(raw, secret)}`;
}

/** How long the counter query may take before the policy's failure mode applies. */
export const LIMITER_TIMEOUT_MS = 2_500;

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * Consumes one unit for every check, atomically, and allows the request only
 * if all of them are within their limits. A check whose subject cannot be
 * keyed (no trusted IP) is skipped; identity checks still apply.
 */
export async function limit(
  checks: LimitCheck[],
  options: { db?: Executor; policies?: Record<PolicyName, LimitPolicy>; timeoutMs?: number } = {}
): Promise<LimitResult> {
  const policies = options.policies ?? POLICIES;
  const rows = checks
    .map((c) => {
      const p = policies[c.policy];
      const key = limiterKey(c.policy, c.subject);
      return key
        ? { key, max: c.subject.kind === 'ip' ? p.ipLimit : p.limit, window: p.windowSeconds, policy: p }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (rows.length === 0) return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };

  const failClosed = rows.some((r) => r.policy.onFailure === 'closed');
  const unavailable = (): LimitResult =>
    failClosed
      ? { allowed: false, reason: 'unavailable', retryAfterSeconds: 30 }
      : { allowed: true, remaining: 0, retryAfterSeconds: 0 };

  const executor = options.db ?? (isDatabaseConfigured() ? defaultDb : null);
  if (!executor) return unavailable();

  const timeoutMs = options.timeoutMs ?? LIMITER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = executor.execute(sql`
      INSERT INTO rate_limits (key, count, window_start, window_seconds)
      VALUES ${sql.join(
        rows.map((r) => sql`(${r.key}, 1, now(), ${r.window})`),
        sql`, `
      )}
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => EXCLUDED.window_seconds)
                     THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => EXCLUDED.window_seconds)
                     THEN now() ELSE rate_limits.window_start END,
        window_seconds = EXCLUDED.window_seconds
      RETURNING key, count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => window_seconds) - now()))))::int AS retry_after
    `);
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const raced = await Promise.race([query, timeout]);
    if (raced === 'timeout') {
      reportError(new Error(`Rate limit query exceeded ${timeoutMs}ms`), {
        scope: 'rateLimit',
        extra: { timedOut: true },
      });
      return unavailable();
    }
    const result = (Array.isArray(raced) ? raced : (raced as { rows: unknown[] }).rows) as {
      key: string;
      count: number;
      retry_after: number;
    }[];
    const byKey = new Map(result.map((r) => [r.key, r]));
    let remaining = Number.MAX_SAFE_INTEGER;
    let retryAfter = 0;
    for (const r of rows) {
      const got = byKey.get(r.key);
      if (!got) return unavailable();
      const count = Number(got.count);
      remaining = Math.min(remaining, Math.max(0, r.max - count));
      if (count > r.max) retryAfter = Math.max(retryAfter, Number(got.retry_after));
    }
    return retryAfter > 0
      ? { allowed: false, reason: 'limited', retryAfterSeconds: retryAfter }
      : { allowed: true, remaining, retryAfterSeconds: 0 };
  } catch (err) {
    reportError(err, { scope: 'rateLimit' });
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}

/** The customer-facing message for a refusal. */
export function limitMessage(result: Extract<LimitResult, { allowed: false }>): string {
  return result.reason === 'unavailable'
    ? 'This is temporarily unavailable. Please try again in a moment.'
    : `Too many attempts. Please wait ${result.retryAfterSeconds} seconds and try again.`;
}

/** The JSON error response for a refusal: 429 with Retry-After, or 503 when the limiter is down. */
export function limitResponse(result: Extract<LimitResult, { allowed: false }>): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: result.reason === 'unavailable' ? 'limiter_unavailable' : 'rate_limited',
        message: limitMessage(result),
      },
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: result.reason === 'unavailable' ? 503 : 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
        'Cache-Control': 'no-store',
      },
    }
  );
}

/** Deletes counters whose window ended more than a day ago. Run by the daily sweep. */
export async function pruneRateLimits(executor: Executor = defaultDb): Promise<number> {
  const result = await executor.execute(sql`
    DELETE FROM rate_limits
    WHERE window_start + make_interval(secs => coalesce(window_seconds, 86400)) < now() - interval '1 day'
    RETURNING key
  `);
  return (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows).length;
}
