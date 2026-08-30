/**
 * Server and edge instrumentation hook.
 *
 * Next calls `register()` once per runtime at startup. Sentry is initialised
 * here only when a DSN is present, so a deployment without one never loads the
 * SDK at all.
 */
export async function register() {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Sample traces rather than sending all of them; full tracing on a
    // storefront is expensive and rarely more informative.
    tracesSampleRate: 0.1,
    // Personal data must not leave the box; see redact() in observability.ts.
    sendDefaultPii: false,
  });
}

/**
 * Reports errors thrown while rendering a request on the server.
 *
 * Next calls this with the error plus request and context objects; their exact
 * shape is Next's, so they are passed straight through.
 */
export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown
): Promise<void> {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  await (
    Sentry.captureRequestError as unknown as (
      e: unknown,
      r: unknown,
      c: unknown
    ) => void | Promise<void>
  )(error, request, context);
}
