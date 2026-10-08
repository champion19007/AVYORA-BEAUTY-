'use client';

import { useEffect, useState } from 'react';
import { skuKey } from '@/modules/catalog/sku-price';
import type { CartLine } from '@/lib/cart';
import type { AvailabilityResponse } from '@/app/api/catalog/availability/route';
import { isCurrent, requestQuote, type FetchedQuote } from '@/lib/quote-client';

export type QuoteState = {
  /** The current quote, or null when there is none that is still valid. */
  quote: AvailabilityResponse | null;
  /**
   * - `loading`: fetching (first time, or because the last quote expired)
   * - `ready`: `quote` is current
   * - `error`: no current quote could be fetched; prices shown are catalogue
   *   figures, unconfirmed
   */
  status: 'idle' | 'loading' | 'ready' | 'error';
};

/**
 * The current price and stock for every SKU in the bag.
 *
 * One batched request for the whole bag, shared with any other caller asking
 * for the same SKUs (lib/quote-client). Refetched when the SKU set changes
 * (not on quantity taps: unit prices do not depend on quantity), when
 * `enabled` turns on, and when the quote expires while the bag is open. A
 * superseded request is cancelled. An expired quote is never shown as
 * confirmed; checkout re-prices on the server regardless.
 */
export function useCartQuote(lines: CartLine[], enabled = true): QuoteState {
  const skus = [...new Set(lines.map((l) => skuKey(l.productId, l.size)))].sort().join(',');
  const [fetched, setFetched] = useState<{ skus: string; q: FetchedQuote } | null>(null);
  const [status, setStatus] = useState<QuoteState['status']>('idle');
  const [refreshAt, setRefreshAt] = useState(0);

  useEffect(() => {
    if (!enabled || !skus) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;

    const load = (attempt: number) =>
      requestQuote(skus, { signal: controller.signal })
        .then((q) => {
          setFetched({ skus, q });
          setStatus('ready');
          // Refresh when this quote stops being current, while the bag is open.
          expiry = setTimeout(() => setRefreshAt(q.expiresAt), Math.max(0, q.expiresAt - Date.now()));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // One retry: a network blip or a route still starting should not
          // leave the bag unconfirmed until its contents change.
          if (attempt === 0) retry = setTimeout(() => void load(1), 2_000);
          else setStatus('error');
        });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the in-flight request
    setStatus('loading');
    void load(0);
    return () => {
      controller.abort();
      clearTimeout(retry);
      clearTimeout(expiry);
    };
  }, [skus, enabled, refreshAt]);

  const current = fetched && fetched.skus === skus && isCurrent(fetched.q) ? fetched.q.quote : null;
  return { quote: current, status: current ? 'ready' : status === 'ready' ? 'loading' : status };
}
