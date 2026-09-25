import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { consumerRegistrations, eventDeliveries } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Event delivery under failure: duplicates, backoff, dead-lettering, replay.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { emitEvent, drain, MAX_ATTEMPTS, replayDelivery, backoffMs } = await import('@/lib/events');

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate domain_events, event_deliveries, consumer_registrations restart identity cascade`);
  await db.insert(consumerRegistrations).values({ consumer: 'test', startEventId: 0 });
});

/** Makes every failed delivery due now, standing in for the passage of time. */
async function fastForward() {
  await db.update(eventDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) });
}

describe('event delivery', () => {
  it('delivers each event to a consumer once, however often it drains', async () => {
    await emitEvent('order.placed', 'o1', { orderId: 'o1' }, undefined, 'req_abc');
    const seen: string[] = [];

    for (let i = 0; i < 3; i++) {
      await drain('test', async (e) => {
        seen.push(String(e.payload.orderId));
      });
    }

    expect(seen).toEqual(['o1']);
  });

  it('carries the originating request id to the consumer', async () => {
    await emitEvent('order.placed', 'o1', { orderId: 'o1' }, undefined, 'req_origin123');
    let got: string | null = null;
    await drain('test', async (e) => {
      got = e.requestId;
    });
    expect(got).toBe('req_origin123');
  });

  it('does not retry before the backoff has elapsed', async () => {
    await emitEvent('order.placed', 'o1', {});
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error('smtp down');
    };

    await drain('test', failing);
    await drain('test', failing);

    expect(calls).toBe(1);
    const [row] = await db.select().from(eventDeliveries);
    expect(row).toMatchObject({ status: 'failed', attempts: 1, lastError: 'smtp down' });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('moves a delivery to the dead-letter state after the last attempt', async () => {
    await emitEvent('order.placed', 'o1', {});
    const failing = async () => {
      throw new Error('permanently broken');
    };

    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await drain('test', failing);
      await fastForward();
    }

    const [row] = await db.select().from(eventDeliveries);
    expect(row.status).toBe('dead');
    expect(row.attempts).toBe(MAX_ATTEMPTS);
  });

  it('keeps delivering other events past a poisoned one', async () => {
    await emitEvent('order.placed', 'bad', { orderId: 'bad' });
    await emitEvent('order.placed', 'good', { orderId: 'good' });
    const done: string[] = [];

    await drain('test', async (e) => {
      if (e.payload.orderId === 'bad') throw new Error('poison');
      done.push(String(e.payload.orderId));
    });

    expect(done).toEqual(['good']);
  });

  it('replays a dead delivery once someone fixes the cause', async () => {
    await emitEvent('order.placed', 'o1', { orderId: 'o1' });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await drain('test', async () => {
        throw new Error('broken');
      });
      await fastForward();
    }

    const [dead] = await db.select().from(eventDeliveries);
    expect(dead.status).toBe('dead');

    expect(await replayDelivery('test', dead.eventId)).toBe(true);
    const handled: string[] = [];
    await drain('test', async (e) => {
      handled.push(String(e.payload.orderId));
    });

    expect(handled).toEqual(['o1']);
    const [after] = await db
      .select()
      .from(eventDeliveries)
      .where(eq(eventDeliveries.eventId, dead.eventId));
    expect(after.status).toBe('done');
  });

  it('backs off exponentially and caps at an hour', () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
