import { registerJob, runJobs, type RunResult } from '@/infrastructure/jobs/worker';
import { enqueue, pruneSucceededJobs } from '@/infrastructure/jobs/queue';
import { analyticsStorage } from '@/infrastructure/storage';
import { PermanentJobError } from '@/infrastructure/jobs/queue';
import { exportEventBatch } from '@/modules/analytics/landing-zone';
import { RECONCILE_JOB, reconcileJobHandler } from '@/modules/payments/jobs';
import { SKIN_ANALYSIS_JOB, skinAnalysisJobHandler } from '@/modules/ai/skin-analysis';
import { drainAll } from '@/lib/event-consumers';
import type { DrainResult } from '@/lib/events';
import { reportError } from '@/lib/observability';

/**
 * Everything that runs after the response: the event consumers, then the
 * job queue.
 *
 * Two triggers, because the free hosting plan offers no always-on worker:
 *
 *   `after()` at the end of checkout   seconds after an order; the fast path
 *   the daily cron                     the backstop for everything else
 *
 * Both call `runBackgroundWork`. With a real worker process (a container, a
 * Pro plan with frequent cron) the same function runs on a timer and none of
 * the queue logic changes.
 */

export const ANALYTICS_EXPORT_JOB = 'analytics.export';

registerJob(RECONCILE_JOB, reconcileJobHandler());
registerJob(SKIN_ANALYSIS_JOB, skinAnalysisJobHandler());
registerJob(ANALYTICS_EXPORT_JOB, async () => {
  const storage = analyticsStorage();
  if (!storage) throw new PermanentJobError('No analytics storage is configured.');
  // A few batches per run; whatever is left waits for the next one.
  for (let i = 0; i < 5; i++) {
    const { exported } = await exportEventBatch(storage);
    if (exported === 0) break;
  }
});

export type BackgroundResult = { consumers: DrainResult[]; jobs: RunResult };

export async function runBackgroundWork(options: { deadlineMs?: number } = {}): Promise<BackgroundResult> {
  const consumers = await drainAll();
  const jobs = await runJobs({ deadlineMs: options.deadlineMs ?? 15_000, limit: 25 });
  return { consumers, jobs };
}

/** For `after()`: never throws into a response that has already been sent. */
export async function runBackgroundQuietly(): Promise<void> {
  try {
    await runBackgroundWork({ deadlineMs: 8_000 });
  } catch (err) {
    reportError(err, { scope: 'background.run' });
  }
}

/** The daily housekeeping the cron adds on top of a normal run. */
export async function scheduleDailyJobs(): Promise<{ analyticsExportQueued: boolean; jobsPruned: number }> {
  const analyticsExportQueued =
    analyticsStorage() !== null &&
    (await enqueue(ANALYTICS_EXPORT_JOB, {}, { dedupeKey: ANALYTICS_EXPORT_JOB })) !== null;
  const jobsPruned = await pruneSucceededJobs().catch(() => 0);
  return { analyticsExportQueued, jobsPruned };
}
