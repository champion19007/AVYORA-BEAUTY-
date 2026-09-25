import { AsyncLocalStorage } from 'node:async_hooks';
import { REQUEST_ID_HEADER } from './request-id';
import { setRequestIdProvider } from '@/lib/observability';

/**
 * Carrying the request id through Node code.
 *
 * Two sources, in order:
 *
 *  1. An explicit context set with `runWithRequestId`. Used where there is no
 *     incoming HTTP request to read — a queue worker, a cron drain, an event
 *     consumer replaying an event that was emitted by an earlier request. The
 *     worker runs each unit of work inside the id that caused it.
 *  2. The `x-request-id` header middleware stamped on the incoming request.
 *     Available in pages, server actions and route handlers.
 *
 * Returns null outside both — a test, a script. Nothing may fail because an id
 * is missing; it only makes the trail shorter.
 */

type Context = { requestId: string };

const storage = new AsyncLocalStorage<Context>();

export function runWithRequestId<T>(requestId: string | null | undefined, fn: () => T): T {
  if (!requestId) return fn();
  return storage.run({ requestId }, fn);
}

/** Synchronous lookup, for log lines. Sees only an explicit context. */
export function requestIdInScope(): string | null {
  return storage.getStore()?.requestId ?? null;
}

/** The id for the current unit of work, from whichever source has one. */
export async function currentRequestId(): Promise<string | null> {
  const scoped = requestIdInScope();
  if (scoped) return scoped;

  try {
    // Imported lazily: `next/headers` throws when called outside a request,
    // and some callers (tests, scripts) are never inside one.
    const { headers } = await import('next/headers');
    return (await headers()).get(REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}

// Every structured log line written inside an explicit context carries its id
// without each call site having to pass it.
setRequestIdProvider(requestIdInScope);
