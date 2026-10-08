import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCurrent, MAX_QUOTE_TTL_MS, MIN_QUOTE_TTL_MS, requestQuote, resetQuoteClient } from '../quote-client';

const SKUS = 'retinol::90ml';
const body = (version: string, validFor = 60_000, serverNow = Date.now()) => ({
  prices: { [SKUS]: { price: 89900, originalPrice: null, offerLabel: null } },
  stock: { [SKUS]: 5 },
  quoteVersion: version,
  validUntil: new Date(serverNow + validFor).toISOString(),
});

/** A fetch whose responses the test resolves by hand. */
function controllableFetch() {
  const calls: { url: string; signal: AbortSignal; respond: (b: unknown, init?: { status?: number; date?: Date }) => void }[] = [];
  const impl = vi.fn((url: string, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      calls.push({
        url,
        signal,
        respond: (b, opts = {}) =>
          resolve(
            new Response(JSON.stringify(b), {
              status: opts.status ?? 200,
              headers: { date: (opts.date ?? new Date()).toUTCString(), 'content-type': 'application/json' },
            })
          ),
      });
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => resetQuoteClient());

describe('quote requests', () => {
  it('shares one request between callers asking for the same SKUs', async () => {
    const f = controllableFetch();
    const a = requestQuote(SKUS, { fetchImpl: f.impl });
    const b = requestQuote(SKUS, { fetchImpl: f.impl });
    expect(f.calls).toHaveLength(1);
    f.calls[0].respond(body('v1'));
    expect((await a).quote.quoteVersion).toBe('v1');
    expect((await b).quote.quoteVersion).toBe('v1');
  });

  it('reuses a current quote instead of asking again', async () => {
    const f = controllableFetch();
    const first = requestQuote(SKUS, { fetchImpl: f.impl });
    f.calls[0].respond(body('v1'));
    await first;
    await requestQuote(SKUS, { fetchImpl: f.impl });
    expect(f.calls).toHaveLength(1);
  });

  it('cancelling one caller keeps the request alive for the other; cancelling both stops it', async () => {
    const f = controllableFetch();
    const one = new AbortController();
    const two = new AbortController();
    const a = requestQuote(SKUS, { fetchImpl: f.impl, signal: one.signal });
    const b = requestQuote(SKUS, { fetchImpl: f.impl, signal: two.signal });
    one.abort();
    await expect(a).rejects.toThrow(/Aborted/);
    expect(f.calls[0].signal.aborted).toBe(false);
    two.abort();
    await expect(b).rejects.toThrow(/Aborted/);
    expect(f.calls[0].signal.aborted).toBe(true);
  });

  it('a failed refresh rejects, and does not poison the next attempt', async () => {
    const f = controllableFetch();
    const failed = requestQuote(SKUS, { fetchImpl: f.impl });
    f.calls[0].respond({ error: 'down' }, { status: 503 });
    await expect(failed).rejects.toThrow(/503/);
    const retried = requestQuote(SKUS, { fetchImpl: f.impl });
    expect(f.calls).toHaveLength(2);
    f.calls[1].respond(body('v2'));
    expect((await retried).quote.quoteVersion).toBe('v2');
  });
});

describe('quote expiry', () => {
  it('measures validity on the server clock, so a fast or slow device clock does not matter', async () => {
    const f = controllableFetch();
    const serverTime = new Date(Date.now() - 10 * 60_000); // device is 10 minutes ahead
    const p = requestQuote(SKUS, { fetchImpl: f.impl });
    f.calls[0].respond(body('v1', 30_000, serverTime.getTime()), { date: serverTime });
    const q = await p;
    expect(isCurrent(q)).toBe(true);
    expect(q.expiresAt - q.receivedAt).toBeGreaterThanOrEqual(29_000);
    expect(q.expiresAt - q.receivedAt).toBeLessThanOrEqual(31_000);
  });

  it('clamps lifetimes: never longer than 60 s, never so short it loops', async () => {
    const f = controllableFetch();
    const long = requestQuote(SKUS, { fetchImpl: f.impl });
    f.calls[0].respond(body('v1', 3_600_000));
    const q1 = await long;
    expect(q1.expiresAt - q1.receivedAt).toBe(MAX_QUOTE_TTL_MS);
    resetQuoteClient();
    const expired = requestQuote(SKUS, { fetchImpl: f.impl });
    f.calls[1].respond(body('v2', -120_000));
    const q2 = await expired;
    expect(q2.expiresAt - q2.receivedAt).toBe(MIN_QUOTE_TTL_MS);
  });

  it('fetches again once the quote has expired', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const f = controllableFetch();
    const first = requestQuote(SKUS, { fetchImpl: f.impl, now });
    f.calls[0].respond(body('v1'));
    const q = await first;
    clock = q.expiresAt + 1;
    expect(isCurrent(q, clock)).toBe(false);
    void requestQuote(SKUS, { fetchImpl: f.impl, now });
    expect(f.calls).toHaveLength(2);
  });
});
