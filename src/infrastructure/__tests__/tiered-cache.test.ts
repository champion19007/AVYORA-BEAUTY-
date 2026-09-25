import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../cache/memory-store';
import { TieredCache } from '../cache/tiered-cache';
import { RedisRestStore } from '../cache/redis-rest-store';
import type { CacheStore } from '../cache/store';
import type { CachePolicy } from '../cache/policies';

/**
 * The cache hierarchy, with a controllable clock and fake layers.
 *
 * The property every test here is really checking: whatever the cache layers
 * do — hit, miss, go stale, vanish, throw — the value returned is either
 * current, or stale by no more than the policy allows. Never wrong.
 */

const policy: CachePolicy = { namespace: 'test', l1Seconds: 5, l2Seconds: 60 };
const noL1: CachePolicy = { namespace: 'cart', l1Seconds: 0, l2Seconds: 60 };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** A Redis stand-in shared between "instances", with a switch to break it. */
function sharedRedis(now: () => number) {
  const store = new MemoryStore(10_000, now);
  let broken = false;
  let calls = 0;
  const wrap = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => {
    calls += 1;
    if (broken) throw new Error('ECONNREFUSED');
    return fn(...a);
  };
  const layer: CacheStore = {
    name: 'fake-redis',
    get: wrap((k: string) => store.get(k)),
    set: wrap((k: string, v: string, t: number) => store.set(k, v, t)),
    del: wrap((k: string[]) => store.del(k)),
    incr: wrap((k: string) => store.incr(k)),
  };
  return {
    layer,
    break: () => (broken = true),
    heal: () => (broken = false),
    get calls() {
      return calls;
    },
  };
}

function source<T>(initial: T) {
  let value = initial;
  let loads = 0;
  return {
    set: (v: T) => (value = v),
    load: async () => {
      loads += 1;
      return value;
    },
    get loads() {
      return loads;
    },
  };
}

describe('tiered cache', () => {
  it('loads once, then serves from L1', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), null, { now: t.now });
    const db = source({ price: 649 });

    expect(await cache.getOrSet(policy, 'sku', db.load)).toEqual({ price: 649 });
    expect(await cache.getOrSet(policy, 'sku', db.load)).toEqual({ price: 649 });

    expect(db.loads).toBe(1);
    expect(cache.stats).toMatchObject({ misses: 1, l1Hits: 1 });
  });

  it('serves from L2 when L1 is cold, and refills L1', async () => {
    const t = clock();
    const redis = sharedRedis(t.now);
    const warm = new TieredCache(new MemoryStore(100, t.now), redis.layer, { now: t.now });
    const cold = new TieredCache(new MemoryStore(100, t.now), redis.layer, { now: t.now });
    const db = source({ price: 649 });

    await warm.getOrSet(policy, 'sku', db.load);
    await cold.getOrSet(policy, 'sku', db.load);
    await cold.getOrSet(policy, 'sku', db.load);

    expect(db.loads).toBe(1);
    expect(cold.stats).toMatchObject({ l2Hits: 1, l1Hits: 1, misses: 0 });
  });

  it('falls through to the database when both layers are empty', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), sharedRedis(t.now).layer, { now: t.now });
    const db = source('from postgres');
    expect(await cache.getOrSet(policy, 'k', db.load)).toBe('from postgres');
    expect(cache.stats.misses).toBe(1);
  });

  it('keeps answering correctly when Redis is down', async () => {
    const t = clock();
    const redis = sharedRedis(t.now);
    redis.break();
    const cache = new TieredCache(new MemoryStore(100, t.now), redis.layer, { now: t.now });
    const db = source({ price: 649 });

    expect(await cache.getOrSet(policy, 'sku', db.load)).toEqual({ price: 649 });
    db.set({ price: 699 });
    t.advance(6_000);
    expect(await cache.getOrSet(policy, 'sku', db.load)).toEqual({ price: 699 });
    expect(cache.stats.l2Errors).toBeGreaterThan(0);
  });

  it('stops calling a failing Redis for the breaker cooldown, then tries again', async () => {
    const t = clock();
    const redis = sharedRedis(t.now);
    redis.break();
    const cache = new TieredCache(new MemoryStore(100, t.now), redis.layer, {
      now: t.now,
      breakerThreshold: 3,
      breakerCooldownMs: 30_000,
    });
    const db = source(1);

    for (let i = 0; i < 5; i++) await cache.getOrSet(noL1, `k${i}`, db.load);
    const callsWhileOpen = redis.calls;
    for (let i = 5; i < 10; i++) await cache.getOrSet(noL1, `k${i}`, db.load);

    expect(redis.calls).toBe(callsWhileOpen);
    expect(cache.stats.l2Skipped).toBeGreaterThan(0);

    redis.heal();
    t.advance(31_000);
    await cache.getOrSet(noL1, 'after', db.load);
    expect(redis.calls).toBeGreaterThan(callsWhileOpen);
  });

  it('serves stale data no longer than the L1 lifetime', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), null, { now: t.now });
    const db = source(649);

    await cache.getOrSet(policy, 'sku', db.load);
    db.set(699);

    t.advance(4_000);
    expect(await cache.getOrSet(policy, 'sku', db.load)).toBe(649);
    t.advance(2_000);
    expect(await cache.getOrSet(policy, 'sku', db.load)).toBe(699);
  });

  it('makes a whole namespace unreachable on invalidation', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), sharedRedis(t.now).layer, { now: t.now });
    const db = source(649);

    await cache.getOrSet(policy, 'a', db.load);
    await cache.getOrSet(policy, 'b', db.load);
    db.set(699);
    await cache.invalidateNamespace(policy);

    expect(await cache.getOrSet(policy, 'a', db.load)).toBe(699);
    expect(await cache.getOrSet(policy, 'b', db.load)).toBe(699);
  });

  it('propagates an invalidation to other instances within the version window', async () => {
    const t = clock();
    const redis = sharedRedis(t.now);
    const a = new TieredCache(new MemoryStore(100, t.now), redis.layer, { now: t.now, versionSeconds: 2 });
    const b = new TieredCache(new MemoryStore(100, t.now), redis.layer, { now: t.now, versionSeconds: 2 });
    const db = source(649);

    await a.getOrSet(noL1, 'cart:1', db.load);
    await b.getOrSet(noL1, 'cart:1', db.load);

    db.set(699);
    await a.invalidateNamespace(noL1);

    // Instance A sees the change at once; B once its version copy expires.
    expect(await a.getOrSet(noL1, 'cart:1', db.load)).toBe(699);
    t.advance(2_100);
    expect(await b.getOrSet(noL1, 'cart:1', db.load)).toBe(699);
  });

  it('never keeps per-person data in L1', async () => {
    const t = clock();
    const l1 = new MemoryStore(100, t.now);
    const cache = new TieredCache(l1, sharedRedis(t.now).layer, { now: t.now });

    await cache.getOrSet(noL1, 'user-42', async () => ['serum']);
    // Only the namespace-version entry, never the cart itself.
    expect(l1.size).toBe(1);
  });

  it('runs one load for many simultaneous misses on the same key', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), null, { now: t.now });
    let loads = 0;
    const slow = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 'v';
    };

    const results = await Promise.all(Array.from({ length: 10 }, () => cache.getOrSet(policy, 'hot', slow)));

    expect(results.every((r) => r === 'v')).toBe(true);
    expect(loads).toBe(1);
    expect(cache.stats.coalesced).toBe(9);
  });

  it('caches a genuine null rather than reloading it every time', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), null, { now: t.now });
    const db = source<string | null>(null);
    await cache.getOrSet(policy, 'missing', db.load);
    await cache.getOrSet(policy, 'missing', db.load);
    expect(db.loads).toBe(1);
  });

  it('lets a failing database load fail, and does not cache the failure', async () => {
    const t = clock();
    const cache = new TieredCache(new MemoryStore(100, t.now), null, { now: t.now });
    let attempt = 0;
    const flaky = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('connection timeout');
      return 'ok';
    };

    await expect(cache.getOrSet(policy, 'k', flaky)).rejects.toThrow('connection timeout');
    expect(await cache.getOrSet(policy, 'k', flaky)).toBe('ok');
  });
});

describe('memory store', () => {
  it('evicts the least recently used entry past its bound', async () => {
    const store = new MemoryStore(2);
    await store.set('a', '1', 60);
    await store.set('b', '2', 60);
    await store.get('a');
    await store.set('c', '3', 60);

    expect(await store.get('a')).toBe('1');
    expect(await store.get('b')).toBeNull();
    expect(await store.get('c')).toBe('3');
  });
});

describe('redis over http', () => {
  it('sends commands in the REST shape and reads results', async () => {
    const sent: unknown[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(String(init.body));
      sent.push(cmd);
      const result = cmd[0] === 'GET' ? 'cached' : cmd[0] === 'INCR' ? 4 : 'OK';
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;

    const redis = new RedisRestStore('https://redis.example', 'token', 250, fakeFetch);
    expect(await redis.get('k')).toBe('cached');
    await redis.set('k', 'v', 30);
    expect(await redis.incr('n')).toBe(4);

    expect(sent).toEqual([['GET', 'k'], ['SET', 'k', 'v', 'EX', 30], ['INCR', 'n']]);
  });

  it('throws on an error reply so the tier above treats it as a miss', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'WRONGPASS' }), { status: 200 })) as unknown as typeof fetch;
    const redis = new RedisRestStore('https://redis.example', 'bad', 250, fakeFetch);
    await expect(redis.get('k')).rejects.toThrow('WRONGPASS');
  });
});
