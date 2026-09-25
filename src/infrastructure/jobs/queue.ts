import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobs } from '@/db/schema';
import type { Tx } from '@/infrastructure/idempotency/idempotency';
import { currentRequestId } from '@/infrastructure/request-context';
import { backoffMs } from '@/lib/events';

/**
 * The job queue: enqueue, claim, complete, fail, replay.
 *
 * Deliberately small. The guarantees are:
 *
 *   at-least-once   a job runs until it succeeds or is declared dead; a
 *                   worker that dies mid-job loses its lock and the job runs
 *                   again, so handlers must be safe to repeat
 *   no double-claim `FOR UPDATE SKIP LOCKED` hands each job to one worker
 *   fenced results  completion is accepted only from the current lock holder
 *   bounded retries exponential backoff (the event log's schedule), then
 *                   `dead`, where it waits for a person
 */

export type JobRow = typeof jobs.$inferSelect;

/** Thrown by a handler for a failure that retrying cannot fix. Goes straight to dead. */
export class PermanentJobError extends Error {}

export type EnqueueOptions = {
  /** Enqueue inside the caller's transaction, so the job exists only if the change does. */
  tx?: Tx;
  runAt?: Date;
  /** At most one queued-or-running job per key. */
  dedupeKey?: string;
  maxAttempts?: number;
};

/**
 * Adds a job. Returns its id, or null when an identical job (same dedupe
 * key) is already waiting or running — which is success, not failure: the
 * work the caller wanted is going to happen.
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {}
): Promise<number | null> {
  const handle = options.tx ?? db;
  const [row] = await handle
    .insert(jobs)
    .values({
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      dedupeKey: options.dedupeKey ?? null,
      maxAttempts: options.maxAttempts ?? 5,
      requestId: await currentRequestId(),
    })
    .onConflictDoNothing()
    .returning({ id: jobs.id });
  return row?.id ?? null;
}

/**
 * Claims up to `limit` jobs that are due, for `leaseMs`.
 *
 * Also reclaims jobs whose worker's lease ran out. Each claim counts as an
 * attempt, so a job that keeps killing its worker still reaches its limit.
 */
export async function claim(workerId: string, limit: number, leaseMs: number): Promise<JobRow[]> {
  const leaseSeconds = Math.max(1, Math.round(leaseMs / 1000));
  const result = await db.execute(sql`
    update ${jobs}
       set status = 'running',
           attempts = ${jobs.attempts} + 1,
           locked_by = ${workerId},
           locked_until = now() + (${leaseSeconds} * interval '1 second'),
           updated_at = now()
     where ${jobs.id} in (
       select ${jobs.id} from ${jobs}
        where (${jobs.status} = 'queued' and ${jobs.runAt} <= now())
           or (${jobs.status} = 'running' and ${jobs.lockedUntil} < now())
        order by ${jobs.runAt}
        limit ${limit}
        for update skip locked
     )
    returning *`);

  const rows = ((result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Record<
    string,
    unknown
  >[];
  return rows.map(toJobRow);
}

/** Raw rows come back snake_cased; the rest of the code expects the schema's names. */
function toJobRow(r: Record<string, unknown>): JobRow {
  const date = (v: unknown) => (v == null ? null : new Date(v as string));
  return {
    id: Number(r.id),
    type: String(r.type),
    payload: r.payload,
    status: r.status as JobRow['status'],
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    runAt: date(r.run_at)!,
    lockedUntil: date(r.locked_until),
    lockedBy: (r.locked_by as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    dedupeKey: (r.dedupe_key as string) ?? null,
    requestId: (r.request_id as string) ?? null,
    createdAt: date(r.created_at)!,
    updatedAt: date(r.updated_at)!,
    completedAt: date(r.completed_at),
  };
}

const heldBy = (job: JobRow) =>
  and(eq(jobs.id, job.id), eq(jobs.status, 'running'), eq(jobs.lockedBy, job.lockedBy ?? ''));

/** Marks a job done. False when this worker no longer holds it. */
export async function complete(job: JobRow): Promise<boolean> {
  const updated = await db
    .update(jobs)
    .set({ status: 'succeeded', lockedUntil: null, completedAt: new Date(), updatedAt: new Date() })
    .where(heldBy(job))
    .returning({ id: jobs.id });
  return updated.length > 0;
}

/**
 * Records a failure: back to the queue after a backoff, or dead when out of
 * attempts or when the handler said retrying cannot help.
 */
export async function fail(job: JobRow, err: unknown): Promise<'retry' | 'dead' | 'lost'> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const dead = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;

  const updated = await db
    .update(jobs)
    .set(
      dead
        ? { status: 'dead', lastError: message, lockedUntil: null, updatedAt: new Date() }
        : {
            status: 'queued',
            lastError: message,
            lockedUntil: null,
            lockedBy: null,
            runAt: new Date(Date.now() + backoffMs(job.attempts)),
            updatedAt: new Date(),
          }
    )
    .where(heldBy(job))
    .returning({ id: jobs.id });

  if (updated.length === 0) return 'lost';
  return dead ? 'dead' : 'retry';
}

/** Puts a dead job back in line with a fresh set of attempts. For the operations console. */
export async function replayJob(id: number): Promise<boolean> {
  const updated = await db
    .update(jobs)
    .set({ status: 'queued', attempts: 0, runAt: new Date(), lockedBy: null, updatedAt: new Date() })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'dead')))
    .returning({ id: jobs.id });
  return updated.length > 0;
}

/** Forgets finished jobs after a week; dead ones are kept until someone deals with them. */
export async function pruneSucceededJobs(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const deleted = await db
    .delete(jobs)
    .where(and(eq(jobs.status, 'succeeded'), lt(jobs.completedAt, cutoff)))
    .returning({ id: jobs.id });
  return deleted.length;
}

/** Counts by status, for the operations console. */
export async function queueDepth(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}
