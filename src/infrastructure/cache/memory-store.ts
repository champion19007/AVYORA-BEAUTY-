import type { CacheStore } from './store';

/**
 * L1: this process's memory.
 *
 * The fastest layer and the least trustworthy. Every serverless instance has
 * its own, it vanishes on a cold start, and nothing tells it when another
 * instance changed the data underneath. That is acceptable only because it
 * holds copies of non-authoritative display data for seconds at a time — the
 * short TTLs in `policies.ts` are what bound how stale one instance can be.
 *
 * Bounded: past `maxEntries` the oldest entry is dropped. A Map iterates in
 * insertion order, and a hit re-inserts its entry, so "oldest" means least
 * recently used. Without a bound, a crawler walking every product would grow
 * this until the function ran out of memory.
 */
export class MemoryStore implements CacheStore {
  readonly name = 'memory';
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 2_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }

  /** Removes every key with a prefix. Local-only; L2 uses namespace versions instead. */
  deletePrefix(prefix: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? '0');
    const next = (Number.isFinite(current) ? current : 0) + 1;
    await this.set(key, String(next), 24 * 60 * 60);
    return next;
  }

  get size(): number {
    return this.entries.size;
  }
}
