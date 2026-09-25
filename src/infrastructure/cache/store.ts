/**
 * A key-value store the cache can sit on.
 *
 * Deliberately tiny: strings in, strings out, with a time to live. Two
 * implementations — process memory (L1) and Redis over HTTP (L2) — and a fake
 * in tests. Business code never sees this interface; it talks to the tiered
 * cache, which decides which layer to ask.
 *
 * Any method may throw. A cache layer failing is expected, not exceptional,
 * and the tiered cache treats every failure as a miss. That is the whole
 * safety argument: a cache that cannot answer is a slow database read, never
 * a wrong one.
 */
export interface CacheStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  /** Atomically increments an integer key, creating it at 1. */
  incr(key: string): Promise<number>;
}
