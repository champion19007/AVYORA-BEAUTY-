/**
 * Browser instrumentation.
 *
 * Only initialises when a DSN is configured, so no monitoring code runs and no
 * requests leave the browser on deployments that have not opted in.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Session replay is deliberately off: it records what customers type,
    // which on a checkout page means addresses and phone numbers.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
