import { PRODUCTS } from '@/data/mock-data';
import type { ReleaseResponse } from '@/app/api/catalog/release/route';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import type { SkinProfileV2 } from '@/modules/personalization/contracts';
import { computeRoutine, type RoutineSnapshot } from '@/modules/personalization/core/routine';
import type { Offer } from '@/modules/personalization/core/selection';
import { requestQuote } from '@/lib/quote-client';

/**
 * The routine finder's state outside React: knowledge release, price
 * quotes, recomputation, saving and reloading.
 *
 * - Every recompute (answers, budget, swap, price refresh) gets a new
 *   generation and aborts the previous one, so an earlier answer can never
 *   overwrite a newer choice.
 * - The plan shown is computed in the browser with the same function and
 *   release the server uses. Saving sends inputs only; the server's result
 *   then replaces the provisional one.
 * - A failed save keeps the routine on screen and can be retried with the
 *   same idempotency key, so a retry after a lost response cannot save twice.
 */

export const ROUTINE_SAVING_POLICY_VERSION = 'routine-saving-v1';

export type SaveState =
  | { status: 'session' }
  | { status: 'saving' }
  | { status: 'saved'; id: string }
  | { status: 'failed'; code: string; message: string; retryAfterSeconds?: number };

export type SavedView = { id: string; validity: 'current' | 'outdated' | 'revoked'; expiresAt: string; profile: SkinProfileV2 };

export type SessionState = {
  phase: 'idle' | 'computing' | 'ready' | 'error';
  profile: SkinProfileV2 | null;
  excluded: string[];
  result: RoutineSnapshot | null;
  /** False when the release is the unpublished repository preview: results are session-only. */
  published: boolean | null;
  /** Local time after which the prices used are stale. */
  pricesExpireAt: number | null;
  /** Counted stock per SKU id from the same quote (null: not counted); caps "add to bag". */
  stock: Readonly<Record<string, number | null>>;
  /** The saved result's new spend differs from the provisional one (prices moved). */
  pricesChangedOnSave: boolean;
  error: string | null;
  save: SaveState;
  /** Set when showing a routine loaded from the server. */
  saved: SavedView | null;
  /** A saved routine that could not be loaded (expired, deleted, withdrawn or someone else's). */
  savedUnavailable: boolean;
};

const INITIAL: SessionState = {
  phase: 'idle',
  profile: null,
  excluded: [],
  result: null,
  published: null,
  pricesExpireAt: null,
  stock: {},
  pricesChangedOnSave: false,
  error: null,
  save: { status: 'session' },
  saved: null,
  savedUnavailable: false,
};

const { variants } = catalogRecords(PRODUCTS);
const ALL_SKUS = variants.map((v) => v.legacyStockKey).sort().join(',');
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

type ErrorBody = { error?: { code?: string; message?: string; details?: { result?: RoutineSnapshot } }; retryAfterSeconds?: number };

export class RoutineSession {
  private state: SessionState = INITIAL;
  private listeners = new Set<() => void>();
  private generation = 0;
  private controller: AbortController | null = null;
  private release: Promise<ReleaseResponse> | null = null;
  private saveKey: string | null = null;

  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;
  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private loadRelease(force = false): Promise<ReleaseResponse> {
    if (!this.release || force) {
      this.release = this.fetchImpl('/api/catalog/release').then(async (r) => {
        if (!r.ok) throw new Error(`release ${r.status}`);
        return (await r.json()) as ReleaseResponse;
      });
      this.release.catch(() => (this.release = null));
    }
    return this.release;
  }

  /** Recomputes the whole plan for these inputs with fresh prices. Superseded calls change nothing. */
  async compute(profile: SkinProfileV2, excluded: string[] = []): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.saveKey = null;
    this.set({ phase: 'computing', profile, excluded, error: null, saved: null, savedUnavailable: false, pricesChangedOnSave: false, save: { status: 'session' } });
    try {
      const [release, quote] = await Promise.all([
        this.loadRelease(),
        requestQuote(ALL_SKUS, { signal: controller.signal, fetchImpl: this.fetchImpl }),
      ]);
      if (generation !== this.generation) return;
      const offers: Record<string, Offer> = {};
      for (const v of variants) {
        const price = quote.quote.prices[v.legacyStockKey]?.price;
        if (price !== undefined) offers[v.id] = { pricePaise: price, stock: quote.quote.stock ? (quote.quote.stock[v.legacyStockKey] ?? 0) : null };
      }
      const result = computeRoutine({ profile, release, products: PRODUCTS, offers, excludeProductIds: excluded });
      const stock = Object.fromEntries(Object.entries(offers).map(([sku, o]) => [sku, o.stock]));
      this.set({ phase: 'ready', result, published: release.published, pricesExpireAt: quote.expiresAt, stock });
    } catch (err) {
      if (isAbort(err) || generation !== this.generation) return;
      // The previous routine, if any, stays on screen with the error beside it.
      this.set({ phase: this.state.result ? 'ready' : 'error', error: 'We could not load current prices and guidance. Check your connection and try again.' });
    }
  }

  setBudget(budgetPaise: number) {
    if (this.state.profile) return this.compute({ ...this.state.profile, budgetPaise }, this.state.excluded);
  }
  swap(productId: string) {
    if (this.state.profile) return this.compute(this.state.profile, [...new Set([...this.state.excluded, productId])].sort());
  }
  undoSwaps() {
    if (this.state.profile) return this.compute(this.state.profile, []);
  }
  refresh() {
    if (this.state.profile) return this.compute(this.state.profile, this.state.excluded);
  }

  /** Grants routine saving, then saves the inputs; the server's routine replaces the provisional one. */
  async save(): Promise<void> {
    const { profile, result, excluded } = this.state;
    if (!profile || !result || this.state.save.status === 'saving') return;
    const generation = this.generation;
    this.saveKey ??= crypto.randomUUID();
    this.set({ save: { status: 'saving' } });
    const failed = (code: string, message: string, retryAfterSeconds?: number) => {
      if (generation === this.generation) this.set({ save: { status: 'failed', code, message, retryAfterSeconds } });
    };
    try {
      const consent = await this.post('/api/consent', { purpose: 'routine_saving', policyVersion: ROUTINE_SAVING_POLICY_VERSION });
      if (!consent.ok) return failed(...(await this.failure(consent)));
      const res = await this.post(
        '/api/routines',
        { profile, kbRelease: result.kbRelease, ...(excluded.length ? { excludeProductIds: excluded } : {}) },
        { 'Idempotency-Key': this.saveKey }
      );
      if (generation !== this.generation) return;
      if (res.ok) {
        const { routine } = (await res.json()) as { routine: { id: string; result: RoutineSnapshot } };
        return this.set({
          result: routine.result,
          save: { status: 'saved', id: routine.id },
          pricesChangedOnSave: routine.result.newSpendPaise !== result.newSpendPaise,
        });
      }
      const [code, message, retryAfter] = await this.failure(res);
      if (code === 'stale_release') {
        // Guidance changed since this plan was made: recalculate with the new release, then ask again.
        this.release = null;
        await this.compute(profile, excluded);
        return this.set({ save: { status: 'failed', code, message: 'Our routine guidance was just updated, so your routine has been recalculated. Review it and save again.' } });
      }
      failed(code, message, retryAfter);
    } catch {
      failed('network', 'We could not reach the server. Your routine is still here; try saving again.');
    }
  }

  /** Loads an owned saved routine; unavailable ones are explained, never replaced with something else. */
  async loadSaved(id: string): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    this.set({ ...INITIAL, phase: 'computing' });
    try {
      const res = await this.fetchImpl(`/api/routines/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (generation !== this.generation) return;
      if (res.status === 404) return this.set({ phase: 'idle', savedUnavailable: true });
      if (!res.ok) return this.set({ phase: 'error', error: 'We could not load your saved routine. Try again shortly.' });
      const { routine } = (await res.json()) as {
        routine: SavedView & { result: RoutineSnapshot | null; kbRelease: string };
      };
      this.set({
        phase: 'ready',
        result: routine.result,
        profile: routine.profile,
        excluded: routine.result?.excludedProductIds ?? [],
        published: true,
        save: { status: 'saved', id: routine.id },
        saved: { id: routine.id, validity: routine.validity, expiresAt: routine.expiresAt, profile: routine.profile },
      });
    } catch {
      if (generation === this.generation) this.set({ phase: 'error', error: 'We could not load your saved routine. Check your connection and try again.' });
    }
  }

  reset() {
    this.generation++;
    this.controller?.abort();
    this.saveKey = null;
    this.set(INITIAL);
  }

  private post(url: string, body: unknown, headers: Record<string, string> = {}) {
    return this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  }

  private async failure(res: Response): Promise<[string, string, number?]> {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    const code = body.error?.code ?? `http_${res.status}`;
    const retryAfter = Number(res.headers.get('retry-after')) || body.retryAfterSeconds;
    const messages: Record<string, string> = {
      rate_limited: `You have saved several routines just now. Try again in ${retryAfter ?? 60} seconds.`,
      limiter_unavailable: 'Saving is briefly unavailable. Your routine is still here; try again shortly.',
      knowledge_unavailable: 'Saving opens once our routine guidance is published. Your routine is shown for this visit only.',
      no_valid_plan: 'This routine can no longer be saved because nothing currently fits your answers. Try a different budget.',
      consent_required: 'We need your permission to save your answers. Try again.',
      pricing_unavailable: 'Prices are briefly unavailable, so we could not save. Try again shortly.',
    };
    return [code, messages[code] ?? body.error?.message ?? 'Saving failed. Your routine is still here; try again.', retryAfter];
  }
}
