/**
 * Error reporting and structured logging.
 *
 * Production failures were invisible: an unhandled error showed the customer a
 * page and left nothing anyone could act on.
 *
 * Two layers, deliberately:
 *
 *  1. **Structured JSON to stdout, always on.** No account, no vendor, no
 *     configuration. Vercel collects it today and CloudWatch will collect it
 *     unchanged after the AWS move, so this layer survives the migration.
 *  2. **Sentry, when a DSN is set.** Adds grouping, alerting and release
 *     tracking. Entirely optional — with no DSN the SDK never initialises and
 *     nothing is sent anywhere.
 *
 * Nothing here may throw. A reporting failure must never become the customer's
 * problem.
 */

export type ErrorContext = {
  /** Where it happened, e.g. 'checkout.placeOrder'. */
  scope: string;
  /** Additional detail. Must not contain personal data — see redact(). */
  extra?: Record<string, unknown>;
  /** Order number, user id and similar, for correlating a support report. */
  correlationId?: string;
};

/** Keys never written to logs, whatever the caller passes. */
const SENSITIVE = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'card',
  'cvv',
  'email',
  'phone',
  'address',
  'line1',
  'line2',
  'postalcode',
  'fullname',
  'apikey',
  'key_secret',
];

/**
 * Strips sensitive values before anything is logged or sent off-box.
 *
 * Logs are the classic place personal data leaks: they are retained longer
 * than the data itself, copied into third-party services, and read by more
 * people than the database is.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;

  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.some((s) => key.toLowerCase().includes(s))
        ? '[redacted]'
        : redact(val, depth + 1);
    }
    return out;
  }

  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/** True when a Sentry DSN is configured. */
export function isMonitoringConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);
}

/**
 * Reports an error. Safe to call from anywhere, including inside a catch that
 * must not fail.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    const normalised =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: 'NonError', message: String(error) };

    // Layer 1: always.
    console.error(
      JSON.stringify({
        level: 'error',
        scope: context.scope,
        correlationId: context.correlationId,
        error: normalised,
        extra: redact(context.extra),
        at: new Date().toISOString(),
      })
    );

    // Layer 2: only when configured. Imported lazily so the SDK is not pulled
    // in at all on deployments that do not use it.
    if (isMonitoringConfigured()) {
      import('@sentry/nextjs')
        .then((Sentry) => {
          Sentry.captureException(error, {
            tags: { scope: context.scope },
            extra: redact(context.extra) as Record<string, unknown>,
          });
        })
        .catch(() => {});
    }
  } catch {
    // Reporting must never throw.
  }
}

/** Structured informational log, for events worth seeing without an error. */
export function logEvent(scope: string, message: string, extra?: Record<string, unknown>): void {
  try {
    console.log(
      JSON.stringify({
        level: 'info',
        scope,
        message,
        extra: redact(extra),
        at: new Date().toISOString(),
      })
    );
  } catch {
    // Ignored.
  }
}
