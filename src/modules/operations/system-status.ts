import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { domainEvents, eventDeliveries, jobs } from '@/db/schema';
import { queueDepth } from '@/infrastructure/jobs/queue';
import { cache } from '@/infrastructure/cache';

/**
 * What the operations console shows about background work: how much is
 * waiting, and what has given up and needs a person.
 *
 * "Dead" is the dead-letter state for both jobs and event deliveries. Nothing
 * retries it automatically; it waits here until the cause is fixed and
 * someone presses replay.
 */
export async function systemStatus() {
  const [depth, deadJobs, deadDeliveries] = await Promise.all([
    queueDepth(),
    db
      .select({
        id: jobs.id,
        type: jobs.type,
        attempts: jobs.attempts,
        lastError: jobs.lastError,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.status, 'dead'))
      .orderBy(desc(jobs.updatedAt))
      .limit(50),
    db
      .select({
        eventId: eventDeliveries.eventId,
        consumer: eventDeliveries.consumer,
        attempts: eventDeliveries.attempts,
        lastError: eventDeliveries.lastError,
        updatedAt: eventDeliveries.updatedAt,
        name: domainEvents.name,
        subject: domainEvents.subject,
      })
      .from(eventDeliveries)
      .innerJoin(domainEvents, eq(domainEvents.id, eventDeliveries.eventId))
      .where(eq(eventDeliveries.status, 'dead'))
      .orderBy(desc(eventDeliveries.updatedAt))
      .limit(50),
  ]);

  return { depth, deadJobs, deadDeliveries, cache: { ...cache.stats } };
}
