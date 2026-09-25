import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { idempotencyKeys } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * The general idempotency mechanism, against a real Postgres.
 *
 * The four cases the brief names, plus the one that decides whether this is
 * safe at all: a command that fails must leave nothing behind, so the retry
 * the client will send is actually carried out.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { withIdempotency, hashPayload, IdempotencyKeyReusedError, pruneExpiredIdempotencyKeys } =
  await import('../idempotency/idempotency');

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate idempotency_keys restart identity`);
});

/** A command that counts how often it actually ran. */
function counter() {
  let runs = 0;
  return {
    get runs() {
      return runs;
    },
    work: async () => {
      runs += 1;
      return { ticket: `T-${runs}` };
    },
  };
}

describe('withIdempotency', () => {
  it('runs once and replays the stored result for the same request', async () => {
    const c = counter();
    const opts = { scope: 'test.op', key: 'k1', payload: { amount: 100 } };

    const first = await withIdempotency(opts, c.work);
    const second = await withIdempotency(opts, c.work);

    expect(c.runs).toBe(1);
    expect(first).toEqual({ result: { ticket: 'T-1' }, replayed: false });
    expect(second).toEqual({ result: { ticket: 'T-1' }, replayed: true });
  });

  it('runs once when the same request arrives concurrently', async () => {
    const c = counter();
    const opts = { scope: 'test.op', key: 'k-race', payload: { amount: 100 } };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => withIdempotency(opts, c.work))
    );

    expect(c.runs).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r.result))).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  });

  it('refuses the same key sent with a different payload', async () => {
    const c = counter();
    await withIdempotency({ scope: 'test.op', key: 'k2', payload: { amount: 100 } }, c.work);

    await expect(
      withIdempotency({ scope: 'test.op', key: 'k2', payload: { amount: 999 } }, c.work)
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    expect(c.runs).toBe(1);
  });

  it('treats the same key in a different scope as a different request', async () => {
    const c = counter();
    await withIdempotency({ scope: 'a', key: 'shared', payload: {} }, c.work);
    await withIdempotency({ scope: 'b', key: 'shared', payload: {} }, c.work);
    expect(c.runs).toBe(2);
  });

  it('runs again once the stored result has expired', async () => {
    const c = counter();
    const opts = { scope: 'test.op', key: 'k3', payload: {} };

    await withIdempotency(opts, c.work);
    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(idempotencyKeys.key, 'k3'));

    const again = await withIdempotency(opts, c.work);
    expect(c.runs).toBe(2);
    expect(again.replayed).toBe(false);
  });

  it('leaves no claim behind when the command fails, so the retry runs', async () => {
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('provider timed out');
      return { ok: true };
    };
    const opts = { scope: 'test.op', key: 'k4', payload: {} };

    await expect(withIdempotency(opts, flaky)).rejects.toThrow('provider timed out');
    expect(await db.select().from(idempotencyKeys)).toHaveLength(0);

    const retry = await withIdempotency(opts, flaky);
    expect(retry).toEqual({ result: { ok: true }, replayed: false });
  });

  it('rolls back the command’s own writes along with the claim', async () => {
    const opts = { scope: 'test.op', key: 'k5', payload: {} };

    await expect(
      withIdempotency(opts, async (tx) => {
        await tx.execute(sql`create temporary table if not exists scratch (v int)`);
        await tx.execute(sql`insert into scratch values (1)`);
        throw new Error('fail after writing');
      })
    ).rejects.toThrow();

    const count = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_tables where tablename = 'scratch'`
    );
    expect(count.rows[0].n).toBe(0);
  });

  it('hashes payloads regardless of key order', () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: 3 } })).toBe(hashPayload({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it('prunes expired claims and nothing else', async () => {
    const c = counter();
    await withIdempotency({ scope: 's', key: 'old', payload: {} }, c.work);
    await withIdempotency({ scope: 's', key: 'fresh', payload: {} }, c.work);
    await db
      .update(idempotencyKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(idempotencyKeys.key, 'old'));

    expect(await pruneExpiredIdempotencyKeys()).toBe(1);
    const left = await db.select({ key: idempotencyKeys.key }).from(idempotencyKeys);
    expect(left.map((r) => r.key)).toEqual(['fresh']);
  });
});
