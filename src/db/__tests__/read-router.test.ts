import { describe, it, expect } from 'vitest';
import { ReadRouter, isConnectionError } from '../read-router';

type FakeDb = { name: 'primary' | 'replica' };
const primary: FakeDb = { name: 'primary' };
const replica: FakeDb = { name: 'replica' };
const where = async (db: FakeDb) => db.name;

function connectionError() {
  // The shape postgres-js produces: a wrapper whose cause is an AggregateError.
  return Object.assign(new Error('Failed query'), {
    cause: Object.assign(new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' })]), {}),
  });
}

function router(overrides: Partial<ConstructorParameters<typeof ReadRouter<FakeDb>>[0]> = {}) {
  let clock = 0;
  const r = new ReadRouter<FakeDb>({
    primary: () => primary,
    replica: () => replica,
    now: () => clock,
    ...overrides,
  });
  return { r, advance: (ms: number) => (clock += ms) };
}

describe('read routing', () => {
  it('sends strong reads to the primary, always', async () => {
    const { r } = router();
    expect(await r.read('strong', where)).toBe('primary');
  });

  it('sends eventual reads to the replica', async () => {
    const { r } = router();
    expect(await r.read('eventual', where)).toBe('replica');
  });

  it('uses the primary for everything when no replica is configured', async () => {
    const { r } = router({ replica: null });
    expect(await r.read('eventual', where)).toBe('primary');
  });

  it('falls back to the primary when the replica is unreachable, then rests it', async () => {
    const { r, advance } = router({ cooldownMs: 30_000 });
    let replicaCalls = 0;
    const flaky = async (db: FakeDb) => {
      if (db.name === 'replica') {
        replicaCalls += 1;
        throw connectionError();
      }
      return db.name;
    };

    expect(await r.read('eventual', flaky)).toBe('primary');
    expect(await r.read('eventual', flaky)).toBe('primary');
    expect(replicaCalls).toBe(1); // resting: not tried again during the cooldown

    advance(30_001);
    expect(await r.read('eventual', where)).toBe('replica');
    expect(r.stats.fallbacks).toBe(1);
  });

  it('does not rerun a query that failed for a SQL reason', async () => {
    const { r } = router();
    let primaryCalls = 0;
    const broken = async (db: FakeDb) => {
      if (db.name === 'primary') primaryCalls += 1;
      throw Object.assign(new Error('cannot execute INSERT in a read-only transaction'), { code: '25006' });
    };
    await expect(r.read('eventual', broken)).rejects.toThrow('read-only transaction');
    expect(primaryCalls).toBe(0);
  });

  it('avoids a replica that has fallen too far behind', async () => {
    let lag = 5;
    const { r, advance } = router({ probeLag: async () => lag, maxLagSeconds: 30, lagCheckMs: 10_000 });
    expect(await r.read('eventual', where)).toBe('replica');

    lag = 120;
    advance(10_001);
    expect(await r.read('eventual', where)).toBe('primary');
    expect(r.stats.lagRejections).toBe(1);

    lag = 1;
    advance(10_001);
    expect(await r.read('eventual', where)).toBe('replica');
  });

  it('probes lag at most once per interval', async () => {
    let probes = 0;
    const { r } = router({ probeLag: async () => (probes++, 0), lagCheckMs: 10_000 });
    await r.read('eventual', where);
    await r.read('eventual', where);
    await r.read('eventual', where);
    expect(probes).toBe(1);
  });
});

describe('isConnectionError', () => {
  it('recognises driver and server connection failures, not query errors', () => {
    expect(isConnectionError(connectionError())).toBe(true);
    expect(isConnectionError(Object.assign(new Error(), { code: '57P01' }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error(), { code: '23505' }))).toBe(false);
    expect(isConnectionError(new Error('plain'))).toBe(false);
  });
});
