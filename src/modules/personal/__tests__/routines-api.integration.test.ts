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
 * The private routine API against real migrations, through the route
 * handlers, with the session, cookies and prices under the test's control.
 * Prices are a test catalogue built from the listed sizes; releases are
 * compiled from the repository's approved knowledge (plus one test-only
 * evidence record for the second release).
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

let sessionUser: string | null = null;
let cookieJar: Record<string, string> = {};
vi.mock('@/auth', () => ({ auth: async () => (sessionUser ? { user: { id: sessionUser } } : null) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar[name] ? { value: cookieJar[name] } : undefined),
    set: (name: string, value: string) => {
      cookieJar[name] = value;
    },
    delete: (name: string) => {
      delete cookieJar[name];
    },
  }),
}));
let offers: Record<string, Offer> = {};
vi.mock('@/modules/personalization/service/offers', () => ({ currentOffers: async () => offers }));

const { variants } = catalogRecords(PRODUCTS);
const PRICES: Record<string, Offer> = Object.fromEntries(
  PRODUCTS.flatMap((p) =>
    p.sizes.map((s) => [
      variants.find((v) => v.productId === p.id && v.sizeLabel === s.label)!.id,
      { pricePaise: s.price * 100, stock: 10 },
    ])
  )
);

const routes = await import('@/app/api/routines/route');
const byId = await import('@/app/api/routines/[id]/route');
const feedback = await import('@/app/api/routines/[id]/feedback/route');
const consent = await import('@/app/api/consent/route');
const { storeRelease, activateRelease, revokeRelease } = await import('@/modules/knowledge/releases');
const { claimGuestRecords, purgeExpiredRoutines } = await import('../routines');
const { GUEST_OWNER_COOKIE, hashGuestSecret } = await import('@/lib/guest-owner');
const { grantConsent } = await import('../personal-records');

const release = (extraEvidence?: string) => {
  const input = productionInput().input;
  if (extraEvidence) {
    input.evidence = [
      ...input.evidence,
      {
        id: extraEvidence,
        title: 'Test only',
        url: null,
        sourceType: 'label',
        retrievedAt: '2026-01-01',
        limitations: 'Test',
      },
    ];
  }
  const r = compileRelease(input, { fixture: false });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.release;
};
const R1 = release();
const R2 = release('test-evidence-r2');
const staff = { id: 'staff-1', role: 'owner' };

const PROFILE = {
  schemaVersion: 2,
  ageBand: 'adult',
  skinType: 'dry',
  reactivity: 'low',
  pregnancy: 'no',
  nursing: 'no',
  currentlyIrritated: 'no',
  allergyHistory: 'no',
  prescribedTreatment: 'no',
  priorities: ['dryness_reported'],
  budgetPaise: 500_000,
  maxDailySteps: 4,
  experience: 'some',
  adherence: 'high',
  allergyIngredientIds: [],
  preferences: { eyeCare: false, bodyCare: false },
  ownedItems: [],
};
const body = (over: Record<string, unknown> = {}) => ({ profile: PROFILE, kbRelease: R1.manifest.releaseId, ...over });

const request = (method: string, init: { body?: unknown; key?: string; origin?: string } = {}) =>
  new Request('http://localhost/api/routines', {
    method,
    headers: {
      'content-type': 'application/json',
      host: 'localhost',
      origin: init.origin ?? 'http://localhost',
      ...(init.key ? { 'idempotency-key': init.key } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const save = (b: unknown = body(), key = 'key-00000001') => routes.POST(request('POST', { body: b, key }));
const get = (id: string) => byId.GET(request('GET'), params(id));
const json = async (r: Response) => r.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const allowSaving = () =>
  consent.POST(request('POST', { body: { purpose: 'routine_saving', policyVersion: 'test-1' } }));
const count = async (table: string) =>
  Number((await client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);

afterAll(async () => {
  await client.close();
});
beforeAll(async () => {
  await storeRelease(db, R1, staff);
  await storeRelease(db, R2, staff);
}, 60_000);
beforeEach(async () => {
  await db.execute(
    sql`truncate users, consent_records, skin_profiles, routine_results, routine_schedule_slots, scan_sessions, routine_feedback, rate_limits restart identity cascade`
  );
  await db.insert(schema.users).values([
    { id: 'user-a', email: 'a@example.test' },
    { id: 'user-b', email: 'b@example.test' },
  ]);
  const active = await activateRelease(db, R1.manifest.releaseId, staff);
  if (!active.ok) throw new Error(active.error);
  offers = { ...PRICES };
  sessionUser = null;
  cookieJar = {};
});

describe('creating a routine', () => {
  it('a guest who allowed saving gets a server-computed routine, its schedule and versions', async () => {
    expect((await allowSaving()).status).toBe(201);
    expect(cookieJar[GUEST_OWNER_COOKIE]).toBeDefined();
    const res = await save();
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const { routine } = await json(res);
    expect(routine).toMatchObject({ validity: 'current', kbRelease: R1.manifest.releaseId });
    expect(routine.result).toMatchObject({
      schemaVersion: 2,
      engineVersion: 'select-plan-2026-10-10',
      inferenceVersion: 'bayes-logodds-1',
      modelVersions: [],
    });
    expect(routine.result.days).toHaveLength(7);
    const [row] = await db.select().from(schema.routineResults);
    expect(row).toMatchObject({
      engineVersion: 'select-plan-2026-10-10',
      inferenceVersion: 'bayes-logodds-1',
      kbRelease: R1.manifest.releaseId,
      userId: null,
    });
    expect(row.anonymousOwnerHash).toBe(hashGuestSecret(cookieJar[GUEST_OWNER_COOKIE]));
    // Guest retention: 30 days.
    expect(row.expiresAt!.getTime() - row.createdAt.getTime()).toBe(30 * 86_400_000);
  });

  it('quiz-only creation works for an account, with no scan', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const res = await save();
    expect(res.status).toBe(201);
    const [row] = await db.select().from(schema.routineResults);
    expect(row.expiresAt!.getTime() - row.createdAt.getTime()).toBe(180 * 86_400_000);
  });

  it('nothing is saved without consent, and an unknown visitor is 401', async () => {
    expect((await save()).status).toBe(401);
    sessionUser = 'user-a';
    const res = await save();
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatchObject({ code: 'consent_required', requestId: expect.any(String) });
    expect(await count('routine_results')).toBe(0);
    expect(await count('skin_profiles')).toBe(0);
  });

  it('a tampered body is rejected: a client result, prices or safety decisions are unknown keys', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    for (const tampered of [
      body({ result: { days: [], purchaseList: [] } }),
      body({ profile: { ...PROFILE, pricePaise: 1 } }),
      body({ profile: { ...PROFILE, excludedClasses: [] } }),
      body({ profile: { ...PROFILE, priorities: ['dryness_reported', 'dryness_reported'] } }),
      body({ profile: { ...PROFILE, budgetPaise: 1.5 } }),
    ]) {
      const res = await save(tampered, `key-${Math.random().toString(36).slice(2, 12)}`);
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe('invalid_request');
    }
    expect(await count('routine_results')).toBe(0);
  });

  it('prices come from the server, never the browser', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    offers = Object.fromEntries(Object.entries(PRICES).map(([k, v]) => [k, { ...v, pricePaise: v.pricePaise + 1 }]));
    const { routine } = await json(await save());
    for (const p of routine.result.purchaseList) expect(p.pricePaise).toBe(PRICES[p.skuId].pricePaise + 1);
  });

  it('a stale release is a 409 naming the active one; no release at all is a 503', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const res = await save(body({ kbRelease: R2.manifest.releaseId }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({
      code: 'stale_release',
      details: { activeRelease: R1.manifest.releaseId },
    });
    await db.delete(schema.kbActiveRelease);
    expect((await save(body(), 'key-00000002')).status).toBe(503);
  });

  it('no valid plan is a 422 carrying the honest no-match, and nothing is saved', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const res = await save(body({ profile: { ...PROFILE, budgetPaise: 0 } }));
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatchObject({
      code: 'no_valid_plan',
      details: { result: { status: 'no_match' } },
    });
    expect(await count('routine_results')).toBe(0);
  });

  it('missing idempotency key, foreign origin and oversized bodies are refused', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    expect((await routes.POST(request('POST', { body: body() }))).status).toBe(400);
    expect(
      (await routes.POST(request('POST', { body: body(), key: 'key-00000001', origin: 'https://evil.example' }))).status
    ).toBe(403);
    const huge = body({
      profile: {
        ...PROFILE,
        ownedItems: [{ id: 'x', label: 'x'.repeat(20_000), ingredientIds: [], coverage: 'unknown', prescribed: false }],
      },
    });
    expect((await save(huge)).status).toBe(413);
  });

  it('the save quota is durable: the sixth save in a minute is a 429 with Retry-After', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    for (let i = 0; i < 5; i++) expect((await save(body(), `key-quota-${i}`)).status).toBe(201);
    const res = await save(body(), 'key-quota-5');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('idempotency', () => {
  it('an identical retry returns the original routine, even after prices change', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const first = await json(await save());
    offers = Object.fromEntries(Object.entries(PRICES).map(([k, v]) => [k, { ...v, pricePaise: v.pricePaise * 2 }]));
    const retry = await save();
    expect(retry.status).toBe(200);
    expect(await json(retry)).toEqual(first);
    expect(await count('routine_results')).toBe(1);
  });

  it('the same key with different inputs is a conflict', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    await save();
    const res = await save(body({ profile: { ...PROFILE, budgetPaise: 400_000 } }));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('idempotency_conflict');
    expect(await count('routine_results')).toBe(1);
  });

  it('concurrent retries create one routine and all return it', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const results = await Promise.all([save(), save(), save()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 201]);
    const ids = new Set(await Promise.all(results.map(async (r) => (await json(r)).routine.id)));
    expect(ids.size).toBe(1);
    expect(await count('routine_results')).toBe(1);
    expect(await count('skin_profiles')).toBe(1);
  });

  it('keys are per owner: another account may use the same key', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    await save();
    sessionUser = 'user-b';
    await allowSaving();
    expect((await save()).status).toBe(201);
  });
});

describe('ownership', () => {
  it('another account, another guest or nobody gets a 404 for a routine id; deletion by them changes nothing', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save());

    sessionUser = 'user-b';
    expect((await get(routine.id)).status).toBe(404);
    expect((await byId.DELETE(request('DELETE'), params(routine.id))).status).toBe(204);
    sessionUser = null;
    cookieJar = {};
    expect((await get(routine.id)).status).toBe(404);
    await allowSaving(); // a different guest
    expect((await get(routine.id)).status).toBe(404);
    expect((await json(await routes.GET(request('GET')))).routines).toEqual([]);
    expect(await count('routine_results')).toBe(1);
  });

  it('a guessed cookie is not ownership', async () => {
    await allowSaving();
    const { routine } = await json(await save());
    cookieJar = { [GUEST_OWNER_COOKIE]: 'A'.repeat(43) };
    expect((await get(routine.id)).status).toBe(404);
  });
});

describe('retrieval after reload, deletion, consent and expiry', () => {
  it('a reload reads the same routine, with the schedule rebuilt from the normalised rows', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const saved = (await json(await save())).routine;
    const again = (await json(await get(saved.id))).routine;
    expect(again).toEqual(saved);
    /* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON from the API under test */
    const fromResult = saved.result.days.flatMap((d: any) =>
      (['am', 'pm'] as const).flatMap((session) =>
        d[session].map((s: any) => ({ day: d.day, session, position: s.position, productId: s.productId ?? null }))
      )
    );
    expect(
      again.schedule.map((s: any) => ({ day: s.day, session: s.session, position: s.position, productId: s.productId }))
    ).toEqual(
      [...fromResult].sort((a, b) => a.day - b.day || a.session.localeCompare(b.session) || a.position - b.position)
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(again.schedule.length).toBeGreaterThan(0);
  });

  it('deletion removes the routine, its answers and schedule, and is idempotent', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save());
    for (let i = 0; i < 2; i++) expect((await byId.DELETE(request('DELETE'), params(routine.id))).status).toBe(204);
    expect(await count('routine_results')).toBe(0);
    expect(await count('skin_profiles')).toBe(0);
    expect(await count('routine_schedule_slots')).toBe(0);
    expect((await get(routine.id)).status).toBe(404);
  });

  it('withdrawing consent hides saved routines at once and stops new saves', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save());
    expect(await json(await consent.DELETE(request('DELETE')))).toEqual({ withdrawn: true });
    expect((await get(routine.id)).status).toBe(404);
    expect((await json(await routes.GET(request('GET')))).routines).toEqual([]);
    expect((await save(body(), 'key-00000002')).status).toBe(403);
  });

  it('an expired routine is never shown, and the sweep deletes it', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save());
    await client.query(
      `update routine_results set created_at = now() - interval '200 days', expires_at = now() - interval '1 day'`
    );
    await client.query(
      `update skin_profiles set created_at = now() - interval '200 days', expires_at = now() - interval '1 day'`
    );
    expect((await get(routine.id)).status).toBe(404);
    expect(await purgeExpiredRoutines(db)).toBe(1);
    expect(await count('skin_profiles')).toBe(0);
    expect(await count('routine_schedule_slots')).toBe(0);
  });

  it('a superseded release marks the routine outdated; a revoked one withholds the result but keeps the record', async () => {
    // Saved under R2 so that R1, active in every other test, is never revoked.
    await activateRelease(db, R2.manifest.releaseId, staff);
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save(body({ kbRelease: R2.manifest.releaseId })));
    await activateRelease(db, R1.manifest.releaseId, staff);
    expect((await json(await get(routine.id))).routine).toMatchObject({
      validity: 'outdated',
      result: { kbRelease: R2.manifest.releaseId },
    });
    expect((await revokeRelease(db, R2.manifest.releaseId, staff, 'test revocation')).ok).toBe(true);
    expect((await json(await get(routine.id))).routine).toMatchObject({ validity: 'revoked', result: null });
    expect(await count('routine_results')).toBe(1);
  });
});

describe('routine history for the account page', () => {
  it('reports every saved routine with its true state, and never another owner’s', async () => {
    const { routineHistory } = await import('../routines');
    sessionUser = 'user-a';
    await allowSaving();
    const a = (await json(await save(body(), 'key-hist-0001'))).routine.id;
    const b = (await json(await save(body({ profile: { ...PROFILE, budgetPaise: 400_000 } }), 'key-hist-0002'))).routine
      .id;
    const owner = { kind: 'user' as const, userId: 'user-a' };
    expect((await routineHistory(db, owner)).map((r) => r.state)).toEqual(['current', 'current']);

    // Expire one: it stays listed, as expired, and cannot be opened.
    await client.query(
      `update routine_results set created_at = now() - interval '200 days', expires_at = now() - interval '1 day' where id = $1`,
      [a]
    );
    const states = Object.fromEntries((await routineHistory(db, owner)).map((r) => [r.id, r.state]));
    expect(states).toEqual({ [a]: 'expired', [b]: 'current' });
    expect((await get(a)).status).toBe(404);

    // Withdraw consent: everything is reported as withdrawn, not silently missing.
    await consent.DELETE(request('DELETE'));
    expect((await routineHistory(db, owner)).map((r) => r.state)).toEqual(['consent_withdrawn', 'consent_withdrawn']);
    expect(await routineHistory(db, { kind: 'user', userId: 'user-b' })).toEqual([]);
  });
});

describe('feedback', () => {
  const fb = (id: string, over: Record<string, unknown> = {}) =>
    feedback.POST(
      request('POST', {
        body: {
          week: 1,
          adherence: 'most_days',
          tolerability: 'comfortable',
          reportedChange: 'unsure',
          kbRelease: R1.manifest.releaseId,
          ...over,
        },
      }),
      params(id)
    );

  it('bounded, once per week, owner only, and tied to the routine release', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const { routine } = await json(await save());
    expect((await fb(routine.id)).status).toBe(201);
    expect((await json(await fb(routine.id))).error.code).toBe('feedback_exists');
    expect((await fb(routine.id, { week: 2, notes: 'free text' })).status).toBe(400);
    expect((await fb(routine.id, { week: 2, kbRelease: R2.manifest.releaseId })).status).toBe(409);
    sessionUser = 'user-b';
    expect((await fb(routine.id, { week: 2 })).status).toBe(404);
    sessionUser = null;
    expect((await fb(routine.id, { week: 2 })).status).toBe(401);
    expect(await count('routine_feedback')).toBe(1);
  });
});

describe('scan observations', () => {
  type Who = { userId?: string; hash?: string };
  const scan = async (who: Who, over: Partial<typeof schema.scanSessions.$inferInsert> = {}) => {
    const c = await grantConsent(
      db,
      who.userId ? { kind: 'user', userId: who.userId } : { kind: 'guest', ownerHash: who.hash! },
      'photo_processing',
      'test-1'
    );
    const [row] = await db
      .insert(schema.scanSessions)
      .values({
        userId: who.userId ?? null,
        anonymousOwnerHash: who.hash ?? null,
        consentId: c.id,
        mode: 'hosted',
        status: 'completed',
        modelVersion: 'test-model-1',
        result: {
          observations: [
            {
              schemaVersion: 1,
              concern: 'dryness_reported',
              state: 'high',
              source: 'vision',
              evidenceGroup: 'test-group',
              quality: 'accepted',
              modelVersion: 'test-model-1',
            },
          ],
        },
        expiresAt: new Date(Date.now() + 86_400_000),
        ...over,
      })
      .returning();
    return { id: row.id, consentId: c.id };
  };

  it('an owned, completed, unexpired scan is used and its model version recorded', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    const s = await scan({ userId: 'user-a' });
    const res = await save(body({ scanId: s.id }));
    expect(res.status).toBe(201);
    expect((await json(res)).routine.result.modelVersions).toEqual(['test-model-1']);
    expect((await db.select().from(schema.routineResults))[0].modelVersion).toBe('test-model-1');
  });

  it('foreign, expired, withdrawn, unfinished and unknown scans are the same 404', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    let i = 0;
    const refused = async (id: string) => {
      const res = await save(body({ scanId: id }), `key-scan-${i++}`);
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe('scan_unavailable');
    };
    await refused((await scan({ userId: 'user-b' })).id);
    await refused(
      (
        await scan(
          { userId: 'user-a' },
          { createdAt: new Date(Date.now() - 3 * 86_400_000), expiresAt: new Date(Date.now() - 60_000) }
        )
      ).id
    );
    await refused((await scan({ userId: 'user-a' }, { status: 'processing', result: null })).id);
    await refused(crypto.randomUUID());
    // Last: withdrawing photo consent revokes every scan under it.
    const usable = await scan({ userId: 'user-a' });
    await client.query(`update consent_records set withdrawn_at = now() where id = $1`, [usable.consentId]);
    await refused(usable.id);
    expect(await count('routine_results')).toBe(0);
  });
});

describe('guest to account', () => {
  it('signing in claims the guest routines atomically and drops the guest cookie', async () => {
    await allowSaving();
    const guestHash = hashGuestSecret(cookieJar[GUEST_OWNER_COOKIE])!;
    const { routine } = await json(await save());

    sessionUser = 'user-a';
    const list = (await json(await routes.GET(request('GET')))).routines;
    expect(list.map((r: { id: string }) => r.id)).toEqual([routine.id]);
    expect(cookieJar[GUEST_OWNER_COOKIE]).toBeUndefined();
    const [row] = await db.select().from(schema.routineResults);
    expect(row).toMatchObject({ userId: 'user-a', anonymousOwnerHash: null });
    expect((await db.select().from(schema.skinProfiles))[0]).toMatchObject({
      userId: 'user-a',
      anonymousOwnerHash: null,
    });
    // The guest grant is withdrawn; the account holds an active grant the records point at.
    const grants = await db.select().from(schema.consentRecords);
    expect(grants.find((g) => g.anonymousOwnerHash === guestHash)?.withdrawnAt).not.toBeNull();
    const accountGrant = grants.find((g) => g.userId === 'user-a')!;
    expect(accountGrant).toMatchObject({ withdrawnAt: null, policyVersion: 'test-1' });
    expect(row.consentId).toBe(accountGrant.id);
    // Idempotent, and the idempotency key travels with the routine.
    expect(await claimGuestRecords(db, 'user-a', guestHash)).toEqual({ moved: 0 });
    expect((await save()).status).toBe(200);
  });

  it('into an account that already allows saving: records join its existing grant', async () => {
    sessionUser = 'user-a';
    await allowSaving();
    sessionUser = null;
    await allowSaving();
    const guestHash = hashGuestSecret(cookieJar[GUEST_OWNER_COOKIE])!;
    await save();
    expect((await claimGuestRecords(db, 'user-a', guestHash)).moved).toBe(2);
    expect(
      await db
        .select()
        .from(schema.consentRecords)
        .where(sql`withdrawn_at is null`)
    ).toHaveLength(1);
  });

  it('a failing claim moves nothing', async () => {
    await allowSaving();
    const guestHash = hashGuestSecret(cookieJar[GUEST_OWNER_COOKIE])!;
    await save();
    await expect(claimGuestRecords(db, 'no-such-user', guestHash)).rejects.toThrow();
    const [row] = await db.select().from(schema.routineResults);
    expect(row).toMatchObject({ userId: null, anonymousOwnerHash: guestHash });
    expect(
      await db
        .select()
        .from(schema.consentRecords)
        .where(sql`withdrawn_at is null`)
    ).toHaveLength(1);
  });
});
