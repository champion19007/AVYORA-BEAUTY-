import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { limit, POLICIES, type LimitCheck } from '../rate-limit';
import * as schema from '@/db/schema';
import { grantConsent } from '@/modules/personal/personal-records';
import { admitHostedScan } from '@/modules/scans/admission';

/*
 * Real concurrency across instances. PGlite is one connection, so it cannot
 * show this; here several independent connection pools (each standing in
 * for one serverless instance) hit a real Postgres at once.
 *
 * Opt-in: set LIMITER_TEST_DATABASE_URL to a disposable database or branch
 * that has the migrations applied. Never point it at production.
 */
const url = process.env.LIMITER_TEST_DATABASE_URL;
const INSTANCES = 4;
const pools = url ? Array.from({ length: INSTANCES }, () => postgres(url, { max: 5 })) : [];

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});

describe.skipIf(!url)('limiter across instances (real Postgres)', () => {
  it('admits exactly the quota when 4 instances race 60 requests', async () => {
    const identity = `multi-${randomUUID()}@example.test`;
    const checks: LimitCheck[] = [{ policy: 'login', subject: { kind: 'identifier', value: identity } }];
    const instances = pools.map((p) => drizzle(p));
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => limit(checks, { db: instances[i % INSTANCES] as never, timeoutMs: 20_000 }))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(POLICIES.login.limit);
  }, 60_000);

  it('does not deadlock when requests lock the same keys in different orders', async () => {
    const a = `a-${randomUUID()}`;
    const b = `b-${randomUUID()}`;
    const checksAB: LimitCheck[] = [
      { policy: 'feedback', subject: { kind: 'identifier', value: a } },
      { policy: 'feedback', subject: { kind: 'identifier', value: b } },
    ];
    const checksBA = [...checksAB].reverse();
    const instances = pools.map((p) => drizzle(p));
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        limit(i % 2 ? checksAB : checksBA, { db: instances[i % INSTANCES] as never, timeoutMs: 20_000 })
      )
    );
    expect(results.every((r) => r.allowed || r.reason === 'limited')).toBe(true);
    expect(results.filter((r) => r.allowed)).toHaveLength(POLICIES.feedback.limit);
  }, 60_000);

  it('admits exactly the per-owner daily quota when 4 instances race scan admissions', async () => {
    const userId = `multi-${randomUUID()}`;
    const instances = pools.map((p) => drizzle(p, { schema }));
    await pools[0]`INSERT INTO users (id, email) VALUES (${userId}, ${`${userId}@example.test`})`;
    try {
      const consent = await grantConsent(instances[0] as never, { kind: 'user', userId }, 'photo_processing', 'test');
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          admitHostedScan(instances[i % INSTANCES] as never, {
            owner: { kind: 'user', userId },
            ipAddress: null,
            consentId: consent.id,
          })
        )
      );
      expect(results.filter((r) => r.admitted)).toHaveLength(3);
    } finally {
      // Cascades to the consent, scans and admissions created above.
      await pools[0]`DELETE FROM users WHERE id = ${userId}`;
    }
  }, 60_000);
});
