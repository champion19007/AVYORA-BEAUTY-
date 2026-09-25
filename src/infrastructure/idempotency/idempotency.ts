import { createHash } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db';
import { idempotencyKeys } from '@/db/schema';
import { currentRequestId } from '@/infrastructure/request-context';

/**
 * Run a command at most once per key.
 *
 * The model:
 *
 *     BEGIN
 *       INSERT claim (scope, key) ON CONFLICT DO NOTHING
 *         ├─ inserted     → run the command inside this transaction,
 *         │                  store its result on the claim, COMMIT
 *         └─ conflicted   → the first request already committed:
 *                           same payload → return its stored result
 *                           different    → refuse (key reused for a new request)
 *
 * The decision is made by the unique index, never by a prior SELECT. A
 * concurrent duplicate's INSERT blocks on the index until the first
 * transaction ends: if it committed, the duplicate sees a finished claim and
 * replays it; if it rolled back, the duplicate's own INSERT succeeds and it
 * runs the command itself. There is no window where both run.
 *
 * Because the claim lives inside the command's transaction, a command that
 * throws leaves no trace, and the client may simply retry. There is
 * deliberately no "in progress" state visible to other requests — they wait
 * rather than being told to come back later.
 *
 * Two rules for callers:
 *
 *  - Do all database work through the `tx` handed to `work`. Writes through the
 *    global `db` are outside the transaction; they survive a rollback and can
 *    deadlock against the rows this transaction holds.
 *  - Return plain JSON. The result is stored in a jsonb column and replayed
 *    from it, so a `Date` comes back as a string and a `Map` as `{}`.
 *
 * External side effects inside `work` (calling a payment provider) are not
 * rolled back if the transaction later fails. Those calls must themselves be
 * safe to repeat, or happen after this returns.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class IdempotencyKeyReusedError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly status = 422;

  constructor(scope: string) {
    super(`This idempotency key was already used for a different ${scope} request.`);
  }
}

export type IdempotencyOptions<T> = {
  /** The command family, e.g. `payment.session`. Keys are unique per scope. */
  scope: string;
  /** Client- or server-derived key identifying one logical request. */
  key: string;
  /** Hashed to detect the same key sent with a different request. */
  payload: unknown;
  /** How long the stored result is honoured. Default seven days. */
  ttlHours?: number;
  /** Optional pointer to what the command created, for support lookups. */
  resource?: (result: T) => { type: string; id: string } | null;
};

export type IdempotentResult<T> = {
  result: T;
  /** True when this call returned a stored result instead of doing the work. */
  replayed: boolean;
};

const DEFAULT_TTL_HOURS = 24 * 7;

/**
 * A stable hash of a payload.
 *
 * Keys are sorted recursively so `{a:1,b:2}` and `{b:2,a:1}` hash the same —
 * otherwise a client that rebuilds its request object in a different order
 * would be told it reused a key for a different request.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export async function withIdempotency<T>(
  options: IdempotencyOptions<T>,
  work: (tx: Tx) => Promise<T>
): Promise<IdempotentResult<T>> {
  const requestHash = hashPayload(options.payload);
  const requestId = await currentRequestId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlHours ?? DEFAULT_TTL_HOURS) * 3_600_000);

  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(idempotencyKeys)
      .values({
        scope: options.scope,
        key: options.key,
        requestHash,
        status: 'processing',
        requestId,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id });

    let claimId = claimed[0]?.id;

    if (!claimId) {
      const [existing] = await tx
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.scope, options.scope), eq(idempotencyKeys.key, options.key)))
        .limit(1);

      /*
       * An expired claim is taken over rather than replayed. The conditional
       * update is the arbiter here too: of two requests finding the same
       * expired row, only one matches `expires_at < now` and wins.
       */
      if (existing?.expiresAt && existing.expiresAt < now) {
        const [taken] = await tx
          .update(idempotencyKeys)
          .set({
            requestHash,
            status: 'processing',
            responseCode: null,
            responseBody: null,
            resourceType: null,
            resourceId: null,
            requestId,
            createdAt: now,
            expiresAt,
          })
          .where(and(eq(idempotencyKeys.id, existing.id), lt(idempotencyKeys.expiresAt, now)))
          .returning({ id: idempotencyKeys.id });
        claimId = taken?.id;
      }

      if (!claimId) {
        if (!existing) {
          // Lost a takeover race to a request that has not finished; the
          // caller's retry will find its result.
          throw new Error(`Idempotency claim for ${options.scope} changed hands; retry the request.`);
        }
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyKeyReusedError(options.scope);
        }
        return { result: existing.responseBody as T, replayed: true };
      }
    }

    const result = await work(tx);
    const resource = options.resource?.(result) ?? null;

    await tx
      .update(idempotencyKeys)
      .set({
        status: 'completed',
        responseCode: 200,
        responseBody: (result ?? null) as unknown,
        resourceType: resource?.type ?? null,
        resourceId: resource?.id ?? null,
      })
      .where(eq(idempotencyKeys.id, claimId));

    return { result, replayed: false };
  });
}

/**
 * Deletes claims past their expiry. Called by the daily sweep.
 *
 * Only housekeeping: an expired claim is already ignored by `withIdempotency`,
 * so correctness never depends on this running.
 */
export async function pruneExpiredIdempotencyKeys(before = new Date()): Promise<number> {
  const removed = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, before))
    .returning({ id: idempotencyKeys.id });
  return removed.length;
}
