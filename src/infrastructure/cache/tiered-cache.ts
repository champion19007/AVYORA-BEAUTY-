import { reportError } from '@/lib/observability';
import { MemoryStore } from './memory-store';
import type { CacheStore } from './store';
import type { CachePolicy } from './policies';

/**
 * L1 → L2 → L3.
 *
 *     read:   L1 hit ─────────────────────────────▶ return
 *             L1 miss ─▶ L2 hit ─▶ fill L1 ───────▶ return
 *                       L2 miss ─▶ load from L3 ─▶ fill L2, L1 ─▶ return
 *
 *     write:  commit to Postgres first, then invalidate.
 *
 * **Invalidation is by namespace version, not by deleting keys.** Every key
 * embeds its namespace's current version. Bumping the version in Redis makes
 * every key in the namespace unreachable on every instance at once, without
 * scanning Redis for them. Old entries simply expire. Each instance reads the
 * version through its own L1 for `versionSeconds`, which is the only window in
 * which it can still serve the previous generation.
 *
 * **Redis failing is a slow path, never a wrong one.** Every L2 call is
 * wrapped; any error counts as a miss and the read falls through to Postgres.
 * After three consecutive errors a circuit breaker stops trying Redis for
 * thirty seconds, so an outage costs one timeout per half-minute instead of
 * one per request.
 *
 * **Concurrent misses are coalesced.** Ten requests for the same cold key run
 * one database query, not ten — the stampede that otherwise follows every
 * invalidation of a popular page.
 */

export type CacheStats = {
  l1Hits: number;
  l2Hits: number;
  misses: number;
  coalesced: number;
  l2Errors: number;
  l2Skipped: number;
};

type Options = {
  now?: () => number;
  /** How long an instance trusts its copy of a namespace version. */
  versionSeconds?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
};

const PREFIX = 'avy';

export class TieredCache {
  private readonly now: () => number;
  private readonly versionSeconds: number;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;

  private consecutiveL2Errors = 0;
  private breakerOpenUntil = 0;
  private readonly inflight = new Map<string, Promise<unknown>>();
  /** Bumped locally on invalidation, so this instance moves on even if Redis is down. */
  private readonly localGeneration = new Map<string, number>();

  readonly stats: CacheStats = {
    l1Hits: 0,
    l2Hits: 0,
    misses: 0,
    coalesced: 0,
    l2Errors: 0,
    l2Skipped: 0,
  };

  constructor(
    private readonly l1: MemoryStore,
    private readonly l2: CacheStore | null,
    options: Options = {}
  ) {
    this.now = options.now ?? Date.now;
    this.versionSeconds = options.versionSeconds ?? 2;
    this.breakerThreshold = options.breakerThreshold ?? 3;
    this.breakerCooldownMs = options.breakerCooldownMs ?? 30_000;
  }

  /** Reads through the layers, loading from the source of truth on a miss. */
  async getOrSet<T>(policy: CachePolicy, key: string, load: () => Promise<T>): Promise<T> {
    const fullKey = await this.keyFor(policy, key);

    if (policy.l1Seconds > 0) {
      const local = await this.l1.get(fullKey);
      if (local !== null) {
        this.stats.l1Hits += 1;
        return JSON.parse(local) as T;
      }
    }

    const shared = await this.l2Call((l2) => l2.get(fullKey));
    if (typeof shared === 'string') {
      this.stats.l2Hits += 1;
      if (policy.l1Seconds > 0) await this.l1.set(fullKey, shared, policy.l1Seconds);
      return JSON.parse(shared) as T;
    }

    const pending = this.inflight.get(fullKey);
    if (pending) {
      this.stats.coalesced += 1;
      return pending as Promise<T>;
    }

    const loading = (async () => {
      this.stats.misses += 1;
      const value = await load();
      const encoded = JSON.stringify(value ?? null);
      await this.l2Call((l2) => l2.set(fullKey, encoded, policy.l2Seconds));
      if (policy.l1Seconds > 0) await this.l1.set(fullKey, encoded, policy.l1Seconds);
      return value;
    })();

    this.inflight.set(fullKey, loading);
    try {
      return await loading;
    } finally {
      this.inflight.delete(fullKey);
    }
  }

  /** Forgets one key, in both layers. */
  async invalidate(policy: CachePolicy, key: string): Promise<void> {
    const fullKey = await this.keyFor(policy, key);
    await this.l1.del([fullKey]);
    await this.l2Call((l2) => l2.del([fullKey]));
  }

  /** Makes every key in a namespace unreachable, here and on every instance. */
  async invalidateNamespace(policy: CachePolicy): Promise<void> {
    const ns = policy.namespace;
    this.localGeneration.set(ns, (this.localGeneration.get(ns) ?? 0) + 1);
    this.l1.deletePrefix(`${PREFIX}:${ns}:`);
    await this.l1.del([this.versionKey(ns)]);
    await this.l2Call((l2) => l2.incr(this.versionKey(ns)));
  }

  /** Drops everything this process holds. For tests, and nothing else. */
  clearLocal(): void {
    this.l1.deletePrefix('');
    this.localGeneration.clear();
    this.inflight.clear();
  }

  private versionKey(ns: string): string {
    return `${PREFIX}:nsv:${ns}`;
  }

  private async keyFor(policy: CachePolicy, key: string): Promise<string> {
    const ns = policy.namespace;
    const vKey = this.versionKey(ns);

    let shared = await this.l1.get(vKey);
    if (shared === null) {
      const fromL2 = await this.l2Call((l2) => l2.get(vKey));
      shared = typeof fromL2 === 'string' ? fromL2 : '0';
      await this.l1.set(vKey, shared, this.versionSeconds);
    }

    return `${PREFIX}:${ns}:v${shared}.${this.localGeneration.get(ns) ?? 0}:${key}`;
  }

  /**
   * Runs one L2 operation, turning every failure into `undefined`.
   * `undefined` means "L2 did not answer"; `null` from `get` means "not there".
   */
  private async l2Call<R>(op: (l2: CacheStore) => Promise<R>): Promise<R | undefined> {
    if (!this.l2) return undefined;

    if (this.now() < this.breakerOpenUntil) {
      this.stats.l2Skipped += 1;
      return undefined;
    }

    try {
      const result = await op(this.l2);
      this.consecutiveL2Errors = 0;
      return result;
    } catch (err) {
      this.stats.l2Errors += 1;
      this.consecutiveL2Errors += 1;
      if (this.consecutiveL2Errors >= this.breakerThreshold) {
        this.breakerOpenUntil = this.now() + this.breakerCooldownMs;
        this.consecutiveL2Errors = 0;
        reportError(err, { scope: 'cache.l2', extra: { breaker: 'open' } });
      }
      return undefined;
    }
  }
}
