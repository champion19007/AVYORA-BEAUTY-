import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMigratedDb } from '@/test/migrated-db';
import {
  limit,
  limiterKey,
  limitResponse,
  loadPolicies,
  normaliseIdentifier,
  POLICIES,
  pruneRateLimits,
  type LimitCheck,
} from '../rate-limit';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec('DELETE FROM rate_limits');
});

const run = (checks: LimitCheck[]) => limit(checks, { db: ctx.db as never });
const login = (identity: string, address: string | null = '203.0.113.7'): LimitCheck[] => [
  { policy: 'login', subject: { kind: 'ip', address } },
  { policy: 'login', subject: { kind: 'identifier', value: identity } },
];

describe('quotas', () => {
  it('allows exactly the quota, then refuses with Retry-After inside the window', async () => {
    for (let i = 0; i < POLICIES.login.limit; i++) expect((await run(login('a@example.test'))).allowed).toBe(true);
    const refused = await run(login('a@example.test'));
    expect(refused).toMatchObject({ allowed: false, reason: 'limited' });
    if (!refused.allowed) {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(POLICIES.login.windowSeconds);
    }
  });

  it('resets when the window has passed', async () => {
    for (let i = 0; i <= POLICIES.otpResend.limit; i++)
      await run([{ policy: 'otpResend', subject: { kind: 'identifier', value: 'b@example.test' } }]);
    expect(
      (await run([{ policy: 'otpResend', subject: { kind: 'identifier', value: 'b@example.test' } }])).allowed
    ).toBe(false);
    await ctx.client.exec(`UPDATE rate_limits SET window_start = now() - interval '61 seconds'`);
    expect(
      (await run([{ policy: 'otpResend', subject: { kind: 'identifier', value: 'b@example.test' } }])).allowed
    ).toBe(true);
  });

  it('is atomic under concurrent requests: exactly the quota succeeds', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => run(login('c@example.test'))));
    expect(results.filter((r) => r.allowed)).toHaveLength(POLICIES.login.limit);
  });

  it('applies every policy in one check: OTP send stops at the per-identifier quota or the resend cooldown', async () => {
    const otp = (id: string): LimitCheck[] => [
      { policy: 'otpSend', subject: { kind: 'identifier', value: id } },
      { policy: 'otpResend', subject: { kind: 'identifier', value: id } },
    ];
    expect((await run(otp('d@example.test'))).allowed).toBe(true);
    // A second code within the minute is refused by the cooldown.
    expect((await run(otp('d@example.test'))).allowed).toBe(false);
  });
});

describe('shared networks and identities', () => {
  it('lets many people on one address sign in (IP is secondary)', async () => {
    const people = Array.from({ length: 12 }, (_, i) => `person${i}@example.test`);
    for (const p of people) expect((await run(login(p, '198.51.100.1'))).allowed).toBe(true);
  });

  it('still stops one identity spread across many addresses', async () => {
    const attempts = Array.from({ length: 12 }, (_, i) => run(login('target@example.test', `198.51.100.${i + 10}`)));
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.allowed)).toHaveLength(POLICIES.login.limit);
  });

  it('still stops one address trying many identities, at the higher IP limit', async () => {
    const results = [];
    for (let i = 0; i < POLICIES.login.ipLimit + 2; i++)
      results.push(await run(login(`guess${i}@example.test`, '192.0.2.99')));
    expect(results.filter((r) => r.allowed)).toHaveLength(POLICIES.login.ipLimit);
  });

  it('normalises identifiers, so case and spacing do not buy extra attempts', async () => {
    expect(normaliseIdentifier('  Mixed@Example.TEST ')).toBe('mixed@example.test');
    for (let i = 0; i < POLICIES.login.limit; i++)
      await run(login(i % 2 ? 'E@Example.test' : ' e@example.test ', null));
    expect((await run(login('e@example.TEST', null))).allowed).toBe(false);
  });

  it('without a trusted address, identity limits still apply', async () => {
    for (let i = 0; i < POLICIES.login.limit; i++) await run(login('f@example.test', null));
    expect((await run(login('f@example.test', null))).allowed).toBe(false);
  });

  it('never stores a raw address or identifier', async () => {
    await run(login('private@example.test', '203.0.113.200'));
    const keys = (await ctx.client.query<{ key: string }>('SELECT key FROM rate_limits')).rows
      .map((r) => r.key)
      .join(' ');
    expect(keys).not.toContain('private@example.test');
    expect(keys).not.toContain('203.0.113.200');
    expect(limiterKey('login', { kind: 'ip', address: '203.0.113.200' })).toMatch(/^login:[A-Za-z0-9_-]{32}$/);
  });
});

describe('limiter failure', () => {
  const failing = {
    execute: async () => {
      throw new Error('connection refused');
    },
  };
  const hanging = { execute: () => new Promise(() => {}) };

  it('refuses costly or credential work (closed) when the counter is unreachable', async () => {
    expect(await limit(login('g@example.test'), { db: failing as never })).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
  });

  it('refuses when the counter hangs, after the timeout', async () => {
    const started = Date.now();
    expect(await limit(login('h@example.test'), { db: hanging as never, timeoutMs: 50 })).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('lets cheap cached reads through (open) when the counter is unreachable', async () => {
    const r = await limit([{ policy: 'catalogBatch', subject: { kind: 'ip', address: '203.0.113.1' } }], {
      db: failing as never,
    });
    expect(r.allowed).toBe(true);
  });

  it('a closed policy wins when mixed with an open one', async () => {
    const r = await limit(
      [
        { policy: 'catalogBatch', subject: { kind: 'ip', address: '203.0.113.1' } },
        { policy: 'checkout', subject: { kind: 'identifier', value: 'x' } },
      ],
      { db: failing as never }
    );
    expect(r.allowed).toBe(false);
  });
});

describe('responses and configuration', () => {
  it('429 with Retry-After for a quota, 503 when the limiter is down, never cached', async () => {
    const limited = limitResponse({ allowed: false, reason: 'limited', retryAfterSeconds: 42 });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('42');
    expect(limited.headers.get('Cache-Control')).toBe('no-store');
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' }, retryAfterSeconds: 42 });
    const down = limitResponse({ allowed: false, reason: 'unavailable', retryAfterSeconds: 30 });
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ error: { code: 'limiter_unavailable' } });
  });

  it('accepts valid overrides and ignores invalid ones', () => {
    expect(loadPolicies('{"login":{"limit":3}}').login).toMatchObject({ limit: 3, ipLimit: POLICIES.login.ipLimit });
    expect(loadPolicies('{"login":{"limit":-1}}').login.limit).toBe(POLICIES.login.limit);
    expect(loadPolicies('not json').login.limit).toBe(POLICIES.login.limit);
  });

  it('prunes counters whose window ended over a day ago', async () => {
    await run(login('old@example.test'));
    await ctx.client.exec(`UPDATE rate_limits SET window_start = now() - interval '3 days'`);
    // Same address: its counter is reused and starts a fresh window, so only
    // the old identity's counter is stale.
    await run(login('new@example.test'));
    expect(await pruneRateLimits(ctx.db as never)).toBe(1);
    expect((await ctx.client.query('SELECT count(*)::int n FROM rate_limits')).rows).toEqual([{ n: 2 }]);
  });

  it('never rate limits the payment webhook (signature and dedupe protect it instead)', () => {
    const source = readFileSync('src/app/api/webhooks/razorpay/route.ts', 'utf8');
    expect(source).not.toMatch(/rate-limit|limit\(\[/);
    expect(source).toMatch(/readBoundedText/);
    expect(source).toMatch(/verifyWebhookSignature/);
  });
});
