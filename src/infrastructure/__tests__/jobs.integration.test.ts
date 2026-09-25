import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { jobs } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * The job queue's promises: one worker per job, retries with backoff, dead
 * after the limit, crash recovery by lease expiry, and a slow worker unable
 * to overwrite the result of the worker that took its job over.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { enqueue, claim, complete, fail, replayJob, PermanentJobError } = await import('../jobs/queue');
const { registerJob, runJobs } = await import('../jobs/worker');

const rows = () => db.select().from(jobs).orderBy(jobs.id);
const expireLeases = () => db.execute(sql`update jobs set locked_until = now() - interval '1 second'`);
const makeDue = () => db.execute(sql`update jobs set run_at = now() - interval '1 second'`);

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate jobs restart identity`);
});

describe('claiming', () => {
  it('hands a job to one worker only', async () => {
    await enqueue('test.noop', {});
    const first = await claim('worker-a', 10, 60_000);
    const second = await claim('worker-b', 10, 60_000);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(first[0]).toMatchObject({ status: 'running', attempts: 1, lockedBy: 'worker-a' });
  });

  it('does not run a job before its time', async () => {
    await enqueue('test.noop', {}, { runAt: new Date(Date.now() + 60_000) });
    expect(await claim('w', 10, 60_000)).toHaveLength(0);
  });

  it('recovers a job whose worker died, and fences the dead worker out', async () => {
    await enqueue('test.noop', {});
    const [stale] = await claim('worker-a', 1, 60_000);
    await expireLeases();

    const [taken] = await claim('worker-b', 1, 60_000);
    expect(taken).toMatchObject({ id: stale.id, lockedBy: 'worker-b', attempts: 2 });

    // worker-a wakes up and reports: ignored, because it no longer holds the job.
    expect(await complete(stale)).toBe(false);
    expect(await fail(stale, new Error('late'))).toBe('lost');
    expect(await complete(taken)).toBe(true);
  });
});

describe('deduplication', () => {
  it('keeps one in flight per key, and allows another once it has finished', async () => {
    expect(await enqueue('payment.reconcile', { orderId: 'o1' }, { dedupeKey: 'reconcile:o1' })).not.toBeNull();
    expect(await enqueue('payment.reconcile', { orderId: 'o1' }, { dedupeKey: 'reconcile:o1' })).toBeNull();

    const [job] = await claim('w', 1, 60_000);
    await complete(job);
    expect(await enqueue('payment.reconcile', { orderId: 'o1' }, { dedupeKey: 'reconcile:o1' })).not.toBeNull();
  });
});

describe('failure', () => {
  it('retries with backoff, then gives up into dead', async () => {
    await enqueue('test.noop', {}, { maxAttempts: 2 });

    const [first] = await claim('w', 1, 60_000);
    expect(await fail(first, new Error('provider down'))).toBe('retry');
    const [afterFirst] = await rows();
    expect(afterFirst.status).toBe('queued');
    expect(afterFirst.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    await makeDue();
    const [second] = await claim('w', 1, 60_000);
    expect(await fail(second, new Error('still down'))).toBe('dead');
    expect((await rows())[0]).toMatchObject({ status: 'dead', lastError: 'still down' });
  });

  it('sends a permanent failure straight to dead', async () => {
    await enqueue('test.noop', {});
    const [job] = await claim('w', 1, 60_000);
    expect(await fail(job, new PermanentJobError('not configured'))).toBe('dead');
  });

  it('replays a dead job with fresh attempts', async () => {
    await enqueue('test.noop', {}, { maxAttempts: 1 });
    const [job] = await claim('w', 1, 60_000);
    await fail(job, new Error('x'));
    expect(await replayJob(job.id)).toBe(true);
    expect((await rows())[0]).toMatchObject({ status: 'queued', attempts: 0 });
    // Only dead jobs can be replayed.
    expect(await replayJob(job.id)).toBe(false);
  });
});

describe('the outbox property', () => {
  it('leaves no job behind when the enqueuing transaction rolls back', async () => {
    await db
      .transaction(async (tx) => {
        await enqueue('test.noop', {}, { tx: tx as never });
        throw new Error('the change failed');
      })
      .catch(() => {});
    expect(await rows()).toHaveLength(0);
  });
});

describe('the worker', () => {
  it('runs handlers, and records outcomes', async () => {
    const seen: unknown[] = [];
    registerJob('test.record', async (payload) => {
      seen.push(payload.n);
    });
    registerJob('test.explode', async () => {
      throw new PermanentJobError('always fails');
    });

    await enqueue('test.record', { n: 1 });
    await enqueue('test.record', { n: 2 });
    await enqueue('test.explode', {});
    await enqueue('test.unknown-type', {});

    const result = await runJobs({ limit: 10, deadlineMs: 5_000 });
    expect(result).toMatchObject({ claimed: 4, succeeded: 2, dead: 2 });
    expect(seen).toEqual([1, 2]);

    const dead = (await rows()).filter((r) => r.status === 'dead');
    expect(dead.map((d) => d.lastError)).toEqual([
      'always fails',
      'No handler registered for job type "test.unknown-type".',
    ]);
  });

  it('gives up on a job that keeps killing its worker', async () => {
    registerJob('test.hang', async () => {});
    await enqueue('test.hang', {}, { maxAttempts: 1 });
    await claim('crashed-worker', 1, 60_000); // attempt 1, never finished
    await expireLeases();

    const result = await runJobs({ deadlineMs: 5_000 });
    expect(result.dead).toBe(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.type, 'test.hang'));
    expect(row.status).toBe('dead');
  });
});
