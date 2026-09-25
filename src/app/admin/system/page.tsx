import type { Metadata } from 'next';
import { isDatabaseConfigured } from '@/db';
import { systemStatus } from '@/modules/operations/system-status';
import { replayDeadDelivery, replayDeadJob } from './actions';

export const metadata: Metadata = { title: 'System' };
export const dynamic = 'force-dynamic';

const label = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground';
const replayButton =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-primary hover:opacity-70';

function when(date: Date) {
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Background work at a glance, and the things that gave up.
 *
 * Replaying is only offered for dead work. Anything still queued or failing
 * with attempts left will be retried on its own; pressing a button would
 * only make it run twice.
 */
export default async function SystemPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const status = await systemStatus();
  const count = (s: string) => status.depth[s] ?? 0;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">System</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Background jobs and event deliveries. Dead items were retried until they ran out of attempts
          and now need someone to fix the cause and replay them.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Queued', count('queued')],
          ['Running', count('running')],
          ['Dead jobs', count('dead')],
          ['Dead deliveries', status.deadDeliveries.length],
        ].map(([name, value]) => (
          <div key={name} className="rounded-xl border border-border bg-card p-4">
            <dt className={label}>{name}</dt>
            <dd className="mt-1 text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className={label}>Dead jobs</h2>
        <ul className="mt-3 rounded-xl border border-border bg-card">
          {status.deadJobs.length === 0 && <li className="p-4 text-[14px] text-muted-foreground">None.</li>}
          {status.deadJobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 last:border-0">
              <div className="min-w-0 text-[14px]">
                <p>
                  <span className="font-medium">{job.type}</span>{' '}
                  <span className="text-muted-foreground">#{job.id} · {job.attempts} attempts · {when(job.updatedAt)}</span>
                </p>
                <p className="mt-1 break-words text-destructive">{job.lastError}</p>
              </div>
              <form action={replayDeadJob}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className={replayButton}>Replay</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={label}>Dead event deliveries</h2>
        <ul className="mt-3 rounded-xl border border-border bg-card">
          {status.deadDeliveries.length === 0 && (
            <li className="p-4 text-[14px] text-muted-foreground">None.</li>
          )}
          {status.deadDeliveries.map((d) => (
            <li
              key={`${d.eventId}:${d.consumer}`}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 last:border-0"
            >
              <div className="min-w-0 text-[14px]">
                <p>
                  <span className="font-medium">{d.name}</span> → {d.consumer}{' '}
                  <span className="text-muted-foreground">event #{d.eventId} · {when(d.updatedAt)}</span>
                </p>
                <p className="mt-1 break-words text-destructive">{d.lastError}</p>
              </div>
              <form action={replayDeadDelivery}>
                <input type="hidden" name="eventId" value={d.eventId} />
                <input type="hidden" name="consumer" value={d.consumer} />
                <button type="submit" className={replayButton}>Replay</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={label}>Cache on this instance</h2>
        <p className="mt-2 text-[14px] tabular-nums text-muted-foreground">
          {status.cache.l1Hits} memory hits · {status.cache.l2Hits} shared hits · {status.cache.misses} misses
          · {status.cache.coalesced} coalesced · {status.cache.l2Errors} shared-cache errors. Counts since
          this server instance started; other instances keep their own.
        </p>
      </section>

      <section>
        <h2 className={label}>Database reads on this instance</h2>
        <p className="mt-2 text-[14px] tabular-nums text-muted-foreground">
          {status.reads.replica
            ? `${status.reads.replicaReads} on the replica · ${status.reads.primaryReads} on the primary · ${status.reads.fallbacks} fell back after a replica failure · ${status.reads.lagRejections} avoided a lagging replica.`
            : 'No read replica configured: every read goes to the primary.'}
        </p>
      </section>
    </div>
  );
}
