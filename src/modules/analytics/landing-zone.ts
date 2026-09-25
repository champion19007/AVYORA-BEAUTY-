import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { domainEvents, exportWatermarks } from '@/db/schema';
import type { ObjectStorage } from '@/infrastructure/storage';
import { toEnvelope } from './envelope';

/**
 * Copies the event log into object storage, in a layout Spark, Hive and
 * Hadoop-family tools read without configuration:
 *
 *   landing/domain_events/dt=2026-09-25/part-000000001234.ndjson
 *
 * One JSON object per line; a `dt=` directory per UTC day, which those tools
 * treat as a partition column. Nothing here runs Spark or Hadoop — this is
 * the boundary where the application's data becomes available to them.
 *
 * Delivery is at-least-once, and re-runs are idempotent at the file level:
 *
 *   - A file is named after the first event id in it. If an export writes
 *     its files and then fails before moving the watermark, the next run
 *     starts from the same id, rebuilds the same files (possibly with more
 *     events in the last one) and overwrites them. No duplicates.
 *   - The watermark row is locked for the duration, so two exports cannot
 *     interleave.
 *   - Only events older than `lagMs` are read. Event ids are assigned at
 *     insert and become visible at commit, so a recent id can still appear
 *     below one already seen; after a few minutes every such transaction has
 *     long since committed or failed.
 *
 * Downstream jobs should still treat `event_id` as the unique key.
 */

export const EXPORT_NAME = 'analytics.domain_events';
const PREFIX = 'landing/domain_events';

export type ExportResult = { exported: number; files: string[]; lastEventId: number };

export function partitionKey(eventDate: Date, firstEventId: number): string {
  const dt = eventDate.toISOString().slice(0, 10);
  return `${PREFIX}/dt=${dt}/part-${String(firstEventId).padStart(12, '0')}.ndjson`;
}

export async function exportEventBatch(
  storage: ObjectStorage,
  options: { batchSize?: number; lagMs?: number; now?: Date } = {}
): Promise<ExportResult> {
  const batchSize = options.batchSize ?? 5_000;
  const cutoff = new Date((options.now ?? new Date()).getTime() - (options.lagMs ?? 5 * 60_000));

  return db.transaction(async (tx) => {
    await tx.insert(exportWatermarks).values({ name: EXPORT_NAME }).onConflictDoNothing();
    const [mark] = await tx
      .select()
      .from(exportWatermarks)
      .where(eq(exportWatermarks.name, EXPORT_NAME))
      .for('update');

    const events = await tx
      .select()
      .from(domainEvents)
      .where(and(gt(domainEvents.id, mark.lastEventId), lt(domainEvents.createdAt, cutoff)))
      .orderBy(asc(domainEvents.id))
      .limit(batchSize);

    if (events.length === 0) return { exported: 0, files: [], lastEventId: mark.lastEventId };

    // Group by UTC day, keeping id order within each file.
    const byDay = new Map<string, typeof events>();
    for (const event of events) {
      const day = event.createdAt.toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }

    const files: string[] = [];
    for (const group of byDay.values()) {
      const key = partitionKey(group[0].createdAt, group[0].id);
      const body = group.map((e) => JSON.stringify(toEnvelope(e))).join('\n') + '\n';
      await storage.put(key, new TextEncoder().encode(body), 'application/x-ndjson');
      files.push(key);
    }

    const lastEventId = events[events.length - 1].id;
    await tx
      .update(exportWatermarks)
      .set({ lastEventId, updatedAt: sql`now()` })
      .where(eq(exportWatermarks.name, EXPORT_NAME));

    return { exported: events.length, files, lastEventId };
  });
}
