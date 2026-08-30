'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Last-resort boundary, for errors thrown in the root layout itself.
 *
 * `error.tsx` cannot catch those, because the layout that would render it is
 * the thing that failed. This replaces the whole document, so it carries its
 * own <html> and <body> and cannot rely on any app styling.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'global-error',
        error: { name: error.name, message: error.message, digest: error.digest },
        at: new Date().toISOString(),
      })
    );
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#FAF8F3',
          color: '#16265E',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 500, marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ lineHeight: 1.7, opacity: 0.75 }}>
            This is on us. Please try again in a moment, or email{' '}
            <a href="mailto:support@avyora.com" style={{ color: '#C9A227' }}>
              support@avyora.com
            </a>
            .
          </p>
          {error.digest && (
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
              Reference: {error.digest}
            </p>
          )}
          {/*
            A plain anchor, not next/link, on purpose: this boundary fires when
            the root layout itself failed, so the client router may not be in a
            usable state. A full document load is the reliable way out.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '2rem',
              padding: '0.9rem 2rem',
              background: '#16265E',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            Back to home
          </a>
        </div>
      </body>
    </html>
  );
}
