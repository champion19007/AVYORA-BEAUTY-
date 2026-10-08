/**
 * Fetching price and stock quotes from the browser.
 *
 * - **One request per SKU set**: callers asking for the same set while a
 *   request is in flight share it, and a quote that has not expired is reused.
 * - **Cancellation per caller**: aborting one caller detaches it; the shared
 *   request is aborted only when no caller is left.
 * - **Expiry on the server's clock**: `validUntil` is compared with the
 *   response's `Date` header, not the browser's clock, so a device whose clock
 *   is minutes off neither trusts an expired quote nor refetches in a loop.
 * - **No out-of-order answers**: requests for one SKU set never overlap
 *   (they are shared), and a superseded caller's answer is discarded by its
 *   abort, so an older quote cannot replace a newer one.
 *
 * Prices shown from a quote are provisional; checkout recomputes everything
 * on the server before taking money.
 */
import type { AvailabilityResponse } from '@/app/api/catalog/availability/route';

export type FetchedQuote = {
  quote: AvailabilityResponse;
  /** Local time (ms) after which the quote is no longer current. */
  expiresAt: number;
  /** Local time the quote arrived. */
  receivedAt: number;
};

/** Quotes are trusted for at most this long, whatever the server says. */
export const MAX_QUOTE_TTL_MS = 60_000;
/** And at least this long, so a slow clock or an old cached copy cannot cause a refetch loop. */
export const MIN_QUOTE_TTL_MS = 5_000;

type InFlight = { promise: Promise<FetchedQuote>; controller: AbortController; waiting: number };

const inflight = new Map<string, InFlight>();
const latest = new Map<string, FetchedQuote>();

/** Clears shared state. For tests. */
export function resetQuoteClient(): void {
  for (const entry of inflight.values()) entry.controller.abort();
  inflight.clear();
  latest.clear();
}

export function isCurrent(q: FetchedQuote | null | undefined, now = Date.now()): q is FetchedQuote {
  return q != null && now < q.expiresAt;
}

function expiryFor(quote: AvailabilityResponse, serverDate: string | null, now: number): number {
  const serverNow = serverDate ? Date.parse(serverDate) : NaN;
  const remaining = Date.parse(quote.validUntil) - (Number.isFinite(serverNow) ? serverNow : now);
  const ttl = Number.isFinite(remaining) ? remaining : 0;
  return now + Math.min(MAX_QUOTE_TTL_MS, Math.max(MIN_QUOTE_TTL_MS, ttl));
}

export async function requestQuote(
  skus: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; now?: () => number } = {}
): Promise<FetchedQuote> {
  const now = options.now ?? Date.now;
  const cached = latest.get(skus);
  if (isCurrent(cached, now())) return cached;

  let entry = inflight.get(skus);
  if (!entry) {
    const controller = new AbortController();
    const fetchImpl = options.fetchImpl ?? fetch;
    const promise = fetchImpl(`/api/catalog/availability?skus=${encodeURIComponent(skus)}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Quote request failed: ${r.status}`);
        const quote = (await r.json()) as AvailabilityResponse;
        const t = now();
        const fetched = { quote, expiresAt: expiryFor(quote, r.headers.get('date'), t), receivedAt: t };
        latest.set(skus, fetched);
        return fetched;
      })
      .finally(() => {
        if (inflight.get(skus)?.promise === promise) inflight.delete(skus);
      });
    entry = { promise, controller, waiting: 0 };
    inflight.set(skus, entry);
  }

  const shared = entry;
  shared.waiting += 1;
  const signal = options.signal;
  return new Promise<FetchedQuote>((resolve, reject) => {
    let settled = false;
    const detach = () => {
      if (settled) return;
      settled = true;
      shared.waiting -= 1;
      // Last caller gone: nobody needs the answer, so stop the request.
      if (shared.waiting === 0 && inflight.get(skus) === shared) {
        shared.controller.abort();
        inflight.delete(skus);
      }
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return detach();
    signal?.addEventListener('abort', detach, { once: true });
    shared.promise.then(
      (q) => {
        if (settled) return;
        settled = true;
        shared.waiting -= 1;
        signal?.removeEventListener('abort', detach);
        resolve(q);
      },
      (err) => {
        if (settled) return;
        settled = true;
        shared.waiting -= 1;
        signal?.removeEventListener('abort', detach);
        reject(err);
      }
    );
  });
}
