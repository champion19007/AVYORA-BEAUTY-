/**
 * Chooses where a read runs: the primary, or a read replica.
 *
 *   'strong'    always the primary. For anything that must see a write that
 *               just happened: checkout, carts, payments, the editor showing
 *               what was just saved — and every cache fill (see below).
 *   'eventual'  the replica when one is configured and healthy, else the
 *               primary. For heavy reads where seconds of lag change nothing:
 *               sales reports, search indexing, recommendation mining.
 *
 * Cache fills are 'strong' even though they feed display pages. A publish
 * invalidates the cache and the next read refills it; if that read hit a
 * replica still a second behind, the old text would be cached for the whole
 * TTL. Misses are rare — the cache absorbs the load — so the replica is kept
 * for the reads that are not cached at all.
 *
 * The replica is optional and never trusted blindly:
 *   - lag is probed every few seconds; beyond `maxLagSeconds` reads go to the
 *     primary until it catches up
 *   - a connection failure sends that read to the primary and stops using
 *     the replica for a cooldown
 *   - a SQL error is not retried: rerunning a broken query on the primary
 *     would only fail twice, or hide a write sent to a read-only replica
 *
 * Generic over the database type so the policy can be tested without one.
 */

export type Consistency = 'strong' | 'eventual';

export type ReadRouterOptions<D> = {
  primary: () => D;
  /** Null when no replica is configured. */
  replica: (() => D) | null;
  /** Seconds behind the primary, or null when unknown. */
  probeLag?: (replica: D) => Promise<number | null>;
  maxLagSeconds?: number;
  lagCheckMs?: number;
  cooldownMs?: number;
  now?: () => number;
};

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08001',
  '08003',
  '08006',
]);

/** True for "could not reach the server", false for "the server said no". */
export function isConnectionError(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_CODES.has(code)) return true;
    // AggregateError from a failed multi-address connect.
    const errors = (e as { errors?: unknown[] }).errors;
    if (Array.isArray(errors) && errors.some((x) => isConnectionError(x))) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export class ReadRouter<D> {
  readonly stats = { primaryReads: 0, replicaReads: 0, fallbacks: 0, lagRejections: 0 };

  private unhealthyUntil = 0;
  private lastLagCheck = -Infinity;
  private lagOk = true;
  private readonly now: () => number;

  constructor(private readonly options: ReadRouterOptions<D>) {
    this.now = options.now ?? (() => Date.now());
  }

  get hasReplica(): boolean {
    return this.options.replica !== null;
  }

  async read<T>(consistency: Consistency, query: (db: D) => Promise<T>): Promise<T> {
    const replica = this.options.replica;
    if (consistency === 'strong' || !replica || this.now() < this.unhealthyUntil) {
      return this.onPrimary(query);
    }

    const handle = replica();
    if (!(await this.lagAcceptable(handle))) {
      this.stats.lagRejections += 1;
      return this.onPrimary(query);
    }

    try {
      const result = await query(handle);
      this.stats.replicaReads += 1;
      return result;
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      this.markUnhealthy();
      this.stats.fallbacks += 1;
      return this.onPrimary(query);
    }
  }

  private async onPrimary<T>(query: (db: D) => Promise<T>): Promise<T> {
    this.stats.primaryReads += 1;
    return query(this.options.primary());
  }

  private markUnhealthy() {
    this.unhealthyUntil = this.now() + (this.options.cooldownMs ?? 30_000);
  }

  private async lagAcceptable(handle: D): Promise<boolean> {
    const probe = this.options.probeLag;
    if (!probe) return true;
    if (this.now() - this.lastLagCheck < (this.options.lagCheckMs ?? 10_000)) return this.lagOk;

    this.lastLagCheck = this.now();
    try {
      const lag = await probe(handle);
      // Unknown lag is not evidence of a problem; a probe that fails is.
      this.lagOk = lag === null || lag <= (this.options.maxLagSeconds ?? 30);
    } catch (err) {
      this.lagOk = false;
      if (isConnectionError(err)) this.markUnhealthy();
    }
    return this.lagOk;
  }
}
