/**
 * Browser instrumentation.
 *
 * Only initialises when a DSN is configured, so no monitoring code runs and no
 * requests leave the browser on deployments that have not opted in.
 *
 * The SDK is imported on demand rather than at the top of the file. A static
 * import put it in the bundle every visitor downloads, on every page, whether
 * or not a DSN was set: it was most of the largest shared chunk. With no DSN
 * at build time the branch below is dead code and the SDK is not shipped at
 * all; with one, it loads as its own chunk after the page.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import('@sentry/nextjs');
let sentry: SentryModule | null = null;

if (dsn) {
  void Promise.all([import('@sentry/nextjs'), import('@/lib/observability')]).then(([S, { scrubDeep }]) => {
    S.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1,
      // Session replay is deliberately off: it records what customers type,
      // which on a checkout page means addresses and phone numbers.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
      // Provider-level scrubbing: anything the SDK captures by itself goes through the same filter.
      beforeSend: (event) => scrubDeep(event),
      beforeBreadcrumb: (crumb) => scrubDeep(crumb),
    });
    sentry = S;
  });
}

/** Navigation timing, once the SDK has loaded; transitions before that are not traced. */
export function onRouterTransitionStart(...args: Parameters<SentryModule['captureRouterTransitionStart']>) {
  sentry?.captureRouterTransitionStart(...args);
}
