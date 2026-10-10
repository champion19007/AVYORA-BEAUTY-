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

/**
 * Supplies the current request id to log lines that were not given one.
 *
 * Injected rather than imported so this file stays free of Node-only modules;
 * `infrastructure/request-context.ts` registers the real provider when it
 * loads. Until then, and at the edge, lines simply carry no id.
 */
let requestIdProvider: () => string | null = () => null;

export function setRequestIdProvider(provider: () => string | null): void {
  requestIdProvider = provider;
}

function ambientRequestId(): string | null {
  try {
    return requestIdProvider();
  } catch {
    return null;
  }
}

export type ErrorContext = {
  /** Where it happened, e.g. 'checkout.placeOrder'. */
  scope: string;
  /** Additional detail. Must not contain personal data — see redact(). */
  extra?: Record<string, unknown>;
  /** Order number, user id and similar, for correlating a support report. */
  correlationId?: string;
  /** Overrides the ambient request id when the caller knows better. */
  requestId?: string | null;
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
  // Personal-care data: questionnaire answers, photos, scan results, owners.
  'answers',
  'profile',
  'photo',
  'image',
  'objectkey',
  'object_key',
  'observation',
  'ownerhash',
  'owner_hash',
  'ipaddress',
  'ip_address',
  'signedurl',
];

/** Personal data that turns up inside free text (error messages, URLs). */
const SCRUB: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/(?<!\d)(\+?91[- ]?)?[6-9]\d{9}(?!\d)/g, '[phone]'],
  [/private\/scans\/[\w.-]+/g, '[private-object]'],
  [/([?&]token=)[\w-]+/g, '$1[redacted]'],
];
/** Personal data removed from free text (error messages, stacks, URLs). */
export const scrubText = (text: string) => SCRUB.reduce((t, [re, to]) => t.replace(re, to), text);
const scrub = scrubText;
const isSensitiveKey = (key: string) => SENSITIVE.some((s) => key.toLowerCase().includes(s));

/**
 * Full-depth scrub for monitoring payloads (a Sentry event or breadcrumb):
 * sensitive keys masked and every string scrubbed, with no truncation, so
 * stack frames and request data are covered too. Used by `beforeSend`.
 */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 40 || value == null) return value;
  if (typeof value === 'string') return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isSensitiveKey(k) ? '[redacted]' : scrubDeep(v, depth + 1);
    return out as T;
  }
  return value;
}

/** A copy of an error with its message and stack scrubbed, for anything that leaves the process. */
export function scrubbedError(error: unknown): Error {
  if (error instanceof Error) {
    const copy = new Error(scrubText(error.message));
    copy.name = error.name;
    copy.stack = error.stack ? scrubText(error.stack) : undefined;
    return copy;
  }
  return new Error(scrubText(String(error)));
}

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

  if (typeof value === 'string') {
    const clean = scrub(value);
    return clean.length > 500 ? `${clean.slice(0, 500)}…` : clean;
  }
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
    // The whole envelope is scrubbed: messages and stacks can carry addresses, tokens and object keys.
    const safe = scrubbedError(error);
    const normalised = error instanceof Error ? { name: safe.name, message: safe.message, stack: safe.stack } : { name: 'NonError', message: safe.message };

    // Layer 1: always.
    console.error(
      JSON.stringify({
        level: 'error',
        scope: context.scope,
        correlationId: context.correlationId,
        requestId: context.requestId ?? ambientRequestId(),
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
          Sentry.captureException(safe, {
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
  log('info', scope, message, extra);
}

/** Structured warning: something unusual that was handled, worth a look if it repeats. */
export function logWarn(scope: string, message: string, extra?: Record<string, unknown>): void {
  log('warn', scope, message, extra);
}

function log(level: 'info' | 'warn', scope: string, message: string, extra?: Record<string, unknown>): void {
  try {
    (level === 'warn' ? console.warn : console.log)(
      JSON.stringify({
        level,
        scope,
        message: scrubText(message),
        requestId: ambientRequestId(),
        extra: redact(extra),
        at: new Date().toISOString(),
      })
    );
  } catch {
    // Ignored.
  }
}
