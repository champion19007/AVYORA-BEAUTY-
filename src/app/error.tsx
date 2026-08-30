'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '@/lib/observability';

/**
 * Route-level error boundary.
 *
 * Without this, an unhandled render error showed Next's raw default page: no
 * header, no branding, no way back into the shop, and nothing logged.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      scope: 'route-error-boundary',
      correlationId: error.digest,
    });
  }, [error]);

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-primary" />
      <h1 className="mt-6 font-headline text-3xl font-normal tracking-[0.02em]">
        Something went wrong
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        This is on us, not you. Try again, and if it keeps happening email{' '}
        <a href="mailto:support@avyora.com" className="text-primary underline">
          support@avyora.com
        </a>
        .
      </p>
      {error.digest && (
        // Lets support correlate a customer report with the server log without
        // exposing the stack trace.
        <p className="mt-3 text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={reset}
          className="rounded-md px-8 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          Try again
        </Button>
        <Link href="/">
          <Button
            variant="outline"
            className="rounded-md px-8 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
