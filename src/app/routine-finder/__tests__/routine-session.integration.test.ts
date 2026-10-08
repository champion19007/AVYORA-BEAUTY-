import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { PRODUCTS } from '@/data/mock-data';
import { createMigratedDb } from '@/test/migrated-db';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { compileRelease } from '@/modules/knowledge/compile';
import { productionInput } from '@/modules/knowledge/production-input';
import type { Offer } from '@/modules/personalization/core/selection';

/*
 * The routine finder's controller (everything the page does except
 * rendering) against the real release, consent and routine routes on real
 * migrations. Only the price quote is served by the test, so prices, delays
 * and failures are under its control. Prices are the catalogue's listed
 * sizes; the release is compiled from the repository's approved knowledge.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
let sessionUser: string | null = null;
let cookieJar: Record<string, string> = {};
vi.mock('@/auth', () => ({ auth: async () => (sessionUser ? { user: { id: sessionUser } } : null) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar[name] ? { value: cookieJar[name] } : undefined),
    set: (name: string, value: string) => void (cookieJar[name] = value),
    delete: (name: string) => void delete cookieJar[name],
  }),
}));
const { variants } = catalogRecords(PRODUCTS);
const PRICES: Record<string, Offer> = Object.fromEntries(
  PRODUCTS.flatMap((p) => p.sizes.map((s) => [variants.find((v) => v.productId === p.id && v.sizeLabel === s.label)!.id, { pricePaise: s.price * 100, stock: 10 }]))
);
vi.mock('@/modules/personalization/service/offers', () => ({ currentOffers: async () => PRICES }));

const releaseRoute = await import('@/app/api/catalog/release/route');
const consentRoute = await import('@/app/api/consent/route');
const routinesRoute = await import('@/app/api/routines/route');
const routineRoute = await import('@/app/api/routines/[id]/route');
const { storeRelease, activateRelease } = await import('@/modules/knowledge/releases');
const { resetQuoteClient } = await import('@/lib/quote-client');
const { RoutineSession } = await import('../routine-session');
const { toProfile } = await import('../quiz');

const compiled = compileRelease(productionInput().input, { fixture: false });
if (!compiled.ok) throw new Error(compiled.errors.join('\n'));
const RELEASE = compiled.release;

/** Test hooks into the fake network. */
let quoteGate: Promise<void> | null = null;
/** Added to every quoted price: the browser's quote can lag the server's current price. */
let quoteDelta = 0;
let failNext: { path: string; response?: Response } | null = null;
const requests: { path: string; headers: Headers }[] = [];

const fetchImpl: typeof fetch = async (input, init = {}) => {
  const url = new URL(String(input), 'http://localhost');
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost');
  headers.set('origin', 'http://localhost');
  requests.push({ path: url.pathname, headers });
  if (failNext && url.pathname === failNext.path) {
    const f = failNext;
    failNext = null;
    if (!f.response) throw new TypeError('Failed to fetch');
    return f.response;
  }
  if (url.pathname === '/api/catalog/availability') {
    if (quoteGate) await quoteGate;
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const prices = Object.fromEntries(variants.map((v) => [v.legacyStockKey, { price: PRICES[v.id].pricePaise + quoteDelta, wasPrice: null, offerLabel: null }]));
    const stock = Object.fromEntries(variants.map((v) => [v.legacyStockKey, 10]));
    return Response.json({ prices, stock, quoteVersion: 'test', validUntil: new Date(Date.now() + 60_000).toISOString() });
  }
  const request = new Request(url, { ...init, headers });
  if (url.pathname === '/api/catalog/release') return releaseRoute.GET();
  if (url.pathname === '/api/consent') return consentRoute.POST(request);
  if (url.pathname === '/api/routines') return init.method === 'POST' ? routinesRoute.POST(request) : routinesRoute.GET(request);
  const id = url.pathname.match(/^\/api\/routines\/([^/]+)$/)?.[1];
  if (id) return routineRoute.GET(request, { params: Promise.resolve({ id }) });
  return new Response('not found', { status: 404 });
};

const profile = (answers: Parameters<typeof toProfile>[0]) => {
  const r = toProfile({ experience: 'new', adherence: 'medium', maxDailySteps: 3, budgetRupees: 5000, ...answers });
  if (!r.ok) throw new Error(`missing ${r.missing}`);
  return r.profile;
};
const BEGINNER = profile({
  priorities: ['dryness_reported'],
  skinType: 'dry',
  reactivity: 'low',
  currentlyIrritated: 'no',
  ageBand: 'adult',
  pregnancy: 'no',
  nursing: 'no',
  allergyHistory: 'no',
  prescribedTreatment: 'no',
});
const scheduled = (s: InstanceType<typeof RoutineSession>) =>
  new Set(s.getState().result!.days.flatMap((d) => [...d.am, ...d.pm]).map((x) => x.productId ?? x.ownedItemId));

afterAll(async () => {
  await client.close();
});
beforeAll(async () => {
  await storeRelease(db, RELEASE, { id: 'staff', role: 'owner' });
}, 60_000);
beforeEach(async () => {
  await db.execute(sql`truncate users, consent_records, skin_profiles, routine_results, routine_schedule_slots, rate_limits restart identity cascade`);
  await db.delete(schema.kbActiveRelease);
  await activateRelease(db, RELEASE.manifest.releaseId, { id: 'staff', role: 'owner' });
  resetQuoteClient();
  quoteGate = null;
  quoteDelta = 0;
  failNext = null;
  requests.length = 0;
  sessionUser = null;
  cookieJar = {};
});

describe('quiz-only journeys', () => {
  it('beginner: a seven-day essentials plan within three steps, session-only until saved', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    const { result, save, published } = s.getState();
    expect(published).toBe(true);
    expect(save).toEqual({ status: 'session' });
    // The quote's counted stock is exposed so "add to bag" can cap by it.
    for (const p of s.getState().result!.purchaseList) expect(s.getState().stock[p.skuId]).toBe(10);
    expect(result!.days).toHaveLength(7);
    for (const d of result!.days) {
      expect(d.am.length).toBeLessThanOrEqual(3);
      expect(d.pm.length).toBeLessThanOrEqual(3);
      expect(d.am.map((x) => x.role)).toEqual(['cleanse', 'moisturise', 'protect']);
    }
    expect(result!.newSpendPaise).toBeLessThanOrEqual(500_000);
    expect(result!.inclusions.length).toBeGreaterThan(0);
    for (const i of result!.inclusions) expect(i.reasons.length).toBeGreaterThan(0);
    // No treatment is scheduled today, and the reason is shown, not hidden.
    expect(result!.exclusions.find((e) => e.productId === 'retinol')?.messages.length).toBeGreaterThan(0);
  });

  it('zero budget with owned products: a routine from what they own, nothing to buy', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(
      profile({
        budgetRupees: 0,
        ownedItems: [
          { id: 'c', label: 'My cleanser', role: 'cleanse', prescribed: false },
          { id: 'm', label: 'My moisturiser', role: 'moisturise', prescribed: false },
          { id: 'p', label: 'My sunscreen', role: 'protect', prescribed: false },
        ],
      })
    );
    const { result } = s.getState();
    expect(result!.status).not.toBe('no_match');
    expect(result!.purchaseList).toEqual([]);
    expect(result!.newSpendPaise).toBe(0);
    expect([...scheduled(s)].sort()).toEqual(['c', 'm', 'p']);
    expect(result!.days[0].am.map((x) => x.source)).toEqual(['owned', 'owned', 'owned']);
  });

  it('restrictive profile: an allergen we cannot check and unknown answers give an honest no-match with reasons', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(profile({ currentlyIrritated: 'yes', allergyHistory: 'yes', allergens: ['unlisted'] }));
    const { result } = s.getState();
    expect(result!.status).toBe('no_match');
    expect(result!.purchaseList).toEqual([]);
    expect(result!.exclusions.every((e) => e.messages.length > 0)).toBe(true);
    expect(result!.unknownSafetyAnswers).toEqual(expect.arrayContaining(['pregnancy', 'nursing']));
  });

  it('substitution: the swapped product is replaced or the slot left honestly unfilled, and the week revalidated', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    const moisturiser = s.getState().result!.days[0].am.find((x) => x.role === 'moisturise')!.productId!;
    await s.swap(moisturiser);
    const { result, excluded } = s.getState();
    expect(excluded).toEqual([moisturiser]);
    expect(scheduled(s).has(moisturiser)).toBe(false);
    expect(result!.excludedProductIds).toEqual([moisturiser]);
    expect(result!.problems).toEqual([]);
    await s.undoSwaps();
    expect(scheduled(s).has(moisturiser)).toBe(true);
  });

  it('a budget change recomputes the whole plan, and an earlier request cannot overwrite a newer one', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    let open!: () => void;
    quoteGate = new Promise((r) => (open = r));
    resetQuoteClient(); // force a fresh quote so both recomputes wait on the gate
    const shown: number[] = [];
    s.subscribe(() => {
      const r = s.getState().result;
      if (s.getState().phase === 'ready' && r) shown.push(r.budgetPaise);
    });
    const first = s.setBudget(500_000);
    const second = s.setBudget(0);
    open();
    await Promise.all([first, second]);
    // The superseded request never reaches the screen, not even briefly.
    expect(shown).toEqual([0]);
    expect(s.getState().result!.budgetPaise).toBe(0);
    expect(s.getState().result!.status).toBe('no_match');
  });

  it('a failed price request keeps the routine and reports the error', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    resetQuoteClient();
    failNext = { path: '/api/catalog/availability' };
    await s.refresh();
    expect(s.getState()).toMatchObject({ phase: 'ready', error: expect.stringMatching(/could not load current prices/) });
    expect(s.getState().result).not.toBeNull();
  });
});

describe('saving and reloading', () => {
  it('a failed save keeps the result and a retry reuses the idempotency key; the server result then replaces it', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    const shown = s.getState().result;
    failNext = { path: '/api/routines' };
    await s.save();
    expect(s.getState().save).toMatchObject({ status: 'failed', code: 'network' });
    expect(s.getState().result).toBe(shown);

    await s.save();
    const saved = s.getState().save;
    expect(saved.status).toBe('saved');
    const keys = requests.filter((r) => r.path === '/api/routines').map((r) => r.headers.get('idempotency-key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(await db.select().from(schema.routineResults)).toHaveLength(1);
  });

  it('the server result replaces the provisional one, and a price change is pointed out', async () => {
    quoteDelta = -100;
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    const provisional = s.getState().result!.newSpendPaise;
    await s.save();
    const { result, pricesChangedOnSave } = s.getState();
    expect(pricesChangedOnSave).toBe(true);
    expect(result!.newSpendPaise).toBeGreaterThan(provisional);
    for (const p of result!.purchaseList) expect(p.pricePaise).toBe(PRICES[p.skuId].pricePaise);
  });

  it('quota and unavailable responses become readable messages and keep the result', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    failNext = {
      path: '/api/routines',
      response: Response.json({ error: { code: 'rate_limited', message: 'x' }, retryAfterSeconds: 42 }, { status: 429, headers: { 'Retry-After': '42' } }),
    };
    await s.save();
    expect(s.getState().save).toMatchObject({ status: 'failed', code: 'rate_limited', retryAfterSeconds: 42, message: expect.stringMatching(/42 seconds/) });
    expect(s.getState().result).not.toBeNull();
  });

  it('saved routine survives a reload: a new controller loads it by id as saved', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    await s.save();
    const id = (s.getState().save as { id: string }).id;

    const afterReload = new RoutineSession(fetchImpl);
    await afterReload.loadSaved(id);
    const st = afterReload.getState();
    expect(st.save).toEqual({ status: 'saved', id });
    expect(st.saved).toMatchObject({ id, validity: 'current' });
    expect(st.result).toEqual(s.getState().result);
    expect(st.profile).toEqual(BEGINNER);
  });

  it('an expired, deleted or foreign saved routine is reported unavailable, not replaced', async () => {
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    await s.save();
    const id = (s.getState().save as { id: string }).id;
    await client.query(`update routine_results set created_at = now() - interval '20 days', expires_at = now() - interval '1 day'`);
    await client.query(`update skin_profiles set created_at = now() - interval '20 days', expires_at = now() - interval '1 day'`);
    const reload = new RoutineSession(fetchImpl);
    await reload.loadSaved(id);
    expect(reload.getState()).toMatchObject({ savedUnavailable: true, result: null, phase: 'idle' });

    cookieJar = {}; // another browser
    await reload.loadSaved(crypto.randomUUID());
    expect(reload.getState().savedUnavailable).toBe(true);
  });

  it('without a published release the preview still works, and saving says why it cannot', async () => {
    await db.delete(schema.kbActiveRelease);
    const s = new RoutineSession(fetchImpl);
    await s.compute(BEGINNER);
    expect(s.getState()).toMatchObject({ phase: 'ready', published: false });
    expect(s.getState().result!.days).toHaveLength(7);
    await s.save();
    expect(s.getState().save).toMatchObject({ status: 'failed', code: 'knowledge_unavailable' });
  });
});
