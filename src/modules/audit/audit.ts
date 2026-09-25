import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { currentRequestId } from '@/infrastructure/request-context';
import type { Tx } from '@/infrastructure/idempotency/idempotency';

/**
 * The audit trail: who changed what, from what, to what, and why.
 *
 * Write it through the same transaction as the change it describes. Then the
 * two commit or roll back together, and there is never a price change without
 * its audit row, or an audit row for a change that did not happen.
 *
 * This is not analytics and not the event log. It is read by people — the
 * owner asking why a price moved last Tuesday, an accountant asking who issued
 * a refund — and nothing in the application ever makes a decision from it.
 */

export type AuditEntry = {
  actor: string;
  actorRole?: string | null;
  /** Verb-first and dotted, e.g. `pricing.set`, `order.cancel`. */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export async function recordAudit(entry: AuditEntry, tx?: Tx): Promise<void> {
  const handle = tx ?? db;
  const requestId = await currentRequestId();

  await handle.insert(auditLogs).values({
    actor: entry.actor,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValue: (entry.before ?? null) as unknown,
    newValue: (entry.after ?? null) as unknown,
    reason: entry.reason ?? null,
    requestId,
  });
}

/** The history of one thing, newest first. */
export async function auditTrail(entityType: string, entityId: string, limit = 50) {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** Recent changes across everything, for the owner's console. */
export async function recentAudit(limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
