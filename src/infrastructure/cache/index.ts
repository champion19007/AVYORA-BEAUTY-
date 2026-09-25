import { MemoryStore } from './memory-store';
import { redisFromEnv } from './redis-rest-store';
import { TieredCache } from './tiered-cache';

/**
 * The process-wide cache.
 *
 * L1 always; L2 when `REDIS_REST_URL` and `REDIS_REST_TOKEN` are set. With no
 * Redis configured — a laptop, the free plan today — this is L1 over Postgres,
 * which is correct on a single instance and bounded-stale across several.
 *
 * Kept on `globalThis` only so development hot-reloads do not create a new
 * cache on every edit. It is still disposable: losing it costs speed, never
 * correctness.
 */
const holder = globalThis as unknown as { __avyoraCache?: TieredCache };

/**
 * `CACHE_L2=memory` stands a process-local store in for Redis.
 *
 * For development and tests only: it behaves like a shared L2 within one
 * process, so invalidation paths are exercised end to end without running
 * Redis. It is not shared between instances and must never be set in
 * production, where it would make every instance believe it had a shared
 * cache it does not.
 */
function secondLayer() {
  if (process.env.CACHE_L2 === 'memory') return new MemoryStore(10_000);
  return redisFromEnv();
}

export const cache: TieredCache =
  holder.__avyoraCache ?? (holder.__avyoraCache = new TieredCache(new MemoryStore(), secondLayer()));

export { POLICIES } from './policies';
export type { CachePolicy, PolicyName } from './policies';
