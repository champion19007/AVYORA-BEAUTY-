import { randomUUID } from 'node:crypto';
import { isDatabaseConfigured } from '@/db';
import { runWithRequestId } from '@/infrastructure/request-context';
import { reportError, logEvent } from '@/lib/observability';
import { claim, complete, fail, PermanentJobError, type JobRow } from './queue';

/**
 * Runs due jobs for a bounded time.
 *
 * There is no always-on worker process: on Vercel there is nowhere to keep
 * one. Jobs are run by whatever invocation has time to spare — the tail of
 * a checkout via `after()`, and the daily cron — and each run stops at its
 * deadline, leaving the rest for next time. A job longer than its lease is
 * a bug in the job; the lease exists to recover from crashes, not to allow
 * that.
 *
 * On a platform with long-lived processes the same function runs in a loop,
 * and nothing about the queue changes.
 */

export type JobHandler = (payload: Record<string, unknown>, job: JobRow) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function registeredJobTypes(): string[] {
  return [...handlers.keys()];
}

export type RunResult = { claimed: number; succeeded: number; retried: number; dead: number; lost: number };

export async function runJobs(
  options: { limit?: number; deadlineMs?: number; leaseMs?: number; workerId?: string } = {}
): Promise<RunResult> {
  const result: RunResult = { claimed: 0, succeeded: 0, retried: 0, dead: 0, lost: 0 };
  if (!isDatabaseConfigured()) return result;

  const workerId = options.workerId ?? `worker_${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (options.deadlineMs ?? 20_000);
  const leaseMs = options.leaseMs ?? 60_000;
  const batch = Math.min(options.limit ?? 10, 50);

  while (Date.now() < deadline) {
    let claimed: JobRow[];
    try {
      claimed = await claim(workerId, batch, leaseMs);
    } catch (err) {
      reportError(err, { scope: 'jobs.claim' });
      break;
    }
    if (claimed.length === 0) break;
    result.claimed += claimed.length;

    for (const job of claimed) {
      const outcome = await runOne(job);
      result[outcome] += 1;
    }
    if (result.claimed >= (options.limit ?? 10)) break;
  }

  if (result.claimed > 0) logEvent('jobs.run', 'ran due jobs', { ...result, workerId });
  return result;
}

async function runOne(job: JobRow): Promise<'succeeded' | 'retried' | 'dead' | 'lost'> {
  const handler = handlers.get(job.type);

  try {
    // A job's attempts beyond its limit (reclaimed after repeated crashes)
    // are not run again: the crash is the answer.
    if (job.attempts > job.maxAttempts) {
      throw new PermanentJobError('Gave up: the job exceeded its attempts (its worker kept stopping).');
    }
    if (!handler) throw new PermanentJobError(`No handler registered for job type "${job.type}".`);

    await runWithRequestId(job.requestId, () =>
      handler((job.payload ?? {}) as Record<string, unknown>, job)
    );
    return (await complete(job)) ? 'succeeded' : 'lost';
  } catch (err) {
    reportError(err, { scope: `jobs.${job.type}`, correlationId: String(job.id) });
    const outcome = await fail(job, err).catch(() => 'lost' as const);
    return outcome === 'retry' ? 'retried' : outcome;
  }
}
