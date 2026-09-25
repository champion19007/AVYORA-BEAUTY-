import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { consumerRegistrations, domainEvents, eventDeliveries } from '@/db/schema';
import { reportError } from '@/lib/observability';
import { runWithRequestId } from '@/infrastructure/request-context';

/**
 * The event log, and the rules for reading it safely.
 *
 * Checkout's only job is to durably record the order and answer the customer.
 * Everything that follows — telling the shop, scoring a cash-on-delivery order
 * for risk, refreshing a sold-out page — is a consequence, and a consequence
 * must never be able to slow down or fail the thing that caused it. That is
 * the one architectural idea here. The storage happens to be a Postgres table
 * because a broker costs money this shop does not yet make, and because at a
 * few hundred events a day a table is not the bottleneck anything is waiting
 * on.
 *
 * Moving to a real broker later is a change to this file and nothing else:
 * `emitEvent` becomes a produce, `pendingFor` a poll. No caller knows which it
 * is talking to.
 */

export type EventName =
  | 'order.placed'
  | 'order.paid'
  | 'order.payment_failed'
  | 'order.refunded'
  | 'order.cancelled'
  | 'order.needs_attention'
  | 'inventory.stock_out'
  | 'inventory.changed'
  | 'pricing.changed'
  | 'content.published'
  | 'content.unpublished';

export type DomainEvent = {
  id: number;
  name: EventName;
  subject: string | null;
  payload: Record<string, unknown>;
  requestId: string | null;
};

/** Read at most this many per drain, so one invocation cannot run long. */
const BATCH_SIZE = 25;

/**
 * How many times a failing event is retried before it is left alone.
 *
 * Past this it stays marked `failed` with its error, visible to anyone
 * looking, rather than being retried forever against a provider that is never
 * going to accept it. Giving up loudly beats retrying silently.
 */
export const MAX_ATTEMPTS = 5;

/**
 * Wait before retry number `attempt` (1-based): 30s, 1m, 2m, 4m, then 8m.
 *
 * A provider that is down for a minute should not have the same message
 * hammered at it every few seconds, and a customer email that goes out eight
 * minutes late is fine. Capped so a long outage still retries within the hour.
 */
export function backoffMs(attempt: number): number {
  const base = 30_000 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base, 60 * 60 * 1000);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Appends an event.
 *
 * Takes the caller's transaction handle on purpose. Passing `tx` is what makes
 * this an outbox rather than a queue: the event and the row it describes
 * commit or roll back as one. Calling it without a transaction is fine for an
 * event that stands alone, and wrong for one that describes a write.
 */
export async function emitEvent(
  name: EventName,
  subject: string | null,
  payload: Record<string, unknown>,
  tx?: Tx,
  requestId?: string | null
): Promise<void> {
  const handle = tx ?? db;
  await handle.insert(domainEvents).values({ name, subject, payload, requestId: requestId ?? null });
}

/**
 * Events this consumer has not successfully handled yet.
 *
 * "Not handled" means no delivery row, or one that failed and still has
 * attempts left. Ordered oldest first as a courtesy rather than a guarantee —
 * see `eventDeliveries` for why ordering is not promised.
 */
export async function pendingFor(consumer: string): Promise<DomainEvent[]> {
  if (!isDatabaseConfigured()) return [];

  const start = await registrationFor(consumer);

  const rows = await db
    .select({
      id: domainEvents.id,
      name: domainEvents.name,
      subject: domainEvents.subject,
      payload: domainEvents.payload,
      requestId: domainEvents.requestId,
    })
    .from(domainEvents)
    .leftJoin(
      eventDeliveries,
      and(
        eq(eventDeliveries.eventId, domainEvents.id),
        eq(eventDeliveries.consumer, consumer)
      )
    )
    .where(
      and(
        gt(domainEvents.id, start),
        or(
          sql`${eventDeliveries.eventId} is null`,
          and(
            eq(eventDeliveries.status, 'failed'),
            sql`${eventDeliveries.attempts} < ${MAX_ATTEMPTS}`,
            // Backoff: not before the time the last failure scheduled.
            sql`coalesce(${eventDeliveries.nextAttemptAt}, now()) <= now()`
          )
        )
      )
    )
    .orderBy(asc(domainEvents.id))
    .limit(BATCH_SIZE);

  return rows.map((r) => ({
    id: r.id,
    name: r.name as EventName,
    subject: r.subject,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    requestId: r.requestId ?? null,
  }));
}

/**
 * Where this consumer started reading, registering it at the head if new.
 *
 * The head-start is what stops a freshly deployed consumer from replaying
 * every order ever placed — which for the notifier would mean emailing the
 * shop's entire history in one go.
 */
async function registrationFor(consumer: string): Promise<number> {
  const [existing] = await db
    .select({ startEventId: consumerRegistrations.startEventId })
    .from(consumerRegistrations)
    .where(eq(consumerRegistrations.consumer, consumer))
    .limit(1);

  if (existing) return existing.startEventId;

  const [head] = await db
    .select({ id: domainEvents.id })
    .from(domainEvents)
    .orderBy(sql`${domainEvents.id} desc`)
    .limit(1);

  /*
   * At the head: a consumer introduced today is not responsible for last
   * month's orders.
   *
   * The consumers that shipped with the log are registered at 0 by the
   * migration instead, so on a fresh database nothing is skipped. This path
   * only runs for a consumer added later, where starting at the head is
   * exactly what is wanted.
   */
  const start = head?.id ?? 0;

  await db
    .insert(consumerRegistrations)
    .values({ consumer, startEventId: start })
    .onConflictDoNothing();

  return start;
}

/** Marks an event handled. Idempotent: a repeat is a no-op. */
export async function markDelivered(consumer: string, eventId: number): Promise<void> {
  await db
    .insert(eventDeliveries)
    .values({ eventId, consumer, status: 'done', attempts: 1 })
    .onConflictDoUpdate({
      target: [eventDeliveries.eventId, eventDeliveries.consumer],
      set: { status: 'done', lastError: null, updatedAt: new Date() },
    });
}

/**
 * Records a failed delivery.
 *
 * Retried with exponential backoff until `MAX_ATTEMPTS`, then moved to `dead`
 * — the dead-letter state. A dead delivery is never retried automatically; it
 * waits in the operations console for a person to fix the cause and replay
 * it. Retrying a permanently broken message forever just hides it.
 */
export async function markFailed(
  consumer: string,
  eventId: number,
  err: unknown
): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);

  await db
    .insert(eventDeliveries)
    .values({
      eventId,
      consumer,
      status: 'failed',
      attempts: 1,
      lastError: message,
      nextAttemptAt: new Date(Date.now() + backoffMs(1)),
    })
    .onConflictDoUpdate({
      target: [eventDeliveries.eventId, eventDeliveries.consumer],
      set: {
        attempts: sql`${eventDeliveries.attempts} + 1`,
        status: sql`case when ${eventDeliveries.attempts} + 1 >= ${MAX_ATTEMPTS} then 'dead' else 'failed' end`,
        nextAttemptAt: sql`now() + (least(30 * power(2, ${eventDeliveries.attempts}), 3600) * interval '1 second')`,
        lastError: message,
        updatedAt: new Date(),
      },
    })
    .catch((e) => reportError(e, { scope: 'events.markFailed' }));
}

/**
 * Puts a dead delivery back in line. Used by the operations console after the
 * cause has been fixed.
 */
export async function replayDelivery(consumer: string, eventId: number): Promise<boolean> {
  const updated = await db
    .update(eventDeliveries)
    .set({ status: 'failed', attempts: 0, nextAttemptAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(eventDeliveries.consumer, consumer),
        eq(eventDeliveries.eventId, eventId),
        eq(eventDeliveries.status, 'dead')
      )
    )
    .returning({ eventId: eventDeliveries.eventId });
  return updated.length > 0;
}

export type DrainResult = { consumer: string; handled: number; failed: number };

/**
 * Runs one consumer over its pending events.
 *
 * A failing event is recorded and the batch continues. This is the difference
 * a delivery row buys over a watermark: one poisonous event can no longer
 * block every event behind it, because there is no queue head to be stuck at.
 */
export async function drain(
  consumer: string,
  handle: (event: DomainEvent) => Promise<void>
): Promise<DrainResult> {
  if (!isDatabaseConfigured()) return { consumer, handled: 0, failed: 0 };

  let handled = 0;
  let failed = 0;

  let events: DomainEvent[] = [];
  try {
    events = await pendingFor(consumer);
  } catch (err) {
    reportError(err, { scope: `events.pending.${consumer}` });
    return { consumer, handled: 0, failed: 0 };
  }

  for (const event of events) {
    try {
      // Each event is handled inside the id of the request that caused it, so
      // a consumer's log lines join the original checkout's trail.
      await runWithRequestId(event.requestId, () => handle(event));
      await markDelivered(consumer, event.id);
      handled += 1;
    } catch (err) {
      reportError(err, { scope: `events.drain.${consumer}`, correlationId: String(event.id) });
      await markFailed(consumer, event.id, err);
      failed += 1;
    }
  }

  return { consumer, handled, failed };
}
