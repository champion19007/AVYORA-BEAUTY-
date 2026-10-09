import { and, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';

/**
 * Support requests for staff (admin → Requests). Reading needs any staff
 * role; changing a request records who did it. Marking one answered only
 * succeeds while it is still open, so two people answering at once cannot
 * both record it.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function listSupportRequests(db: Db, status: 'open' | 'all' = 'all') {
  return db
    .select()
    .from(schema.supportRequests)
    .where(status === 'open' ? eq(schema.supportRequests.status, 'open') : sql`true`)
    .orderBy(desc(schema.supportRequests.createdAt))
    .limit(200);
}

export async function markSupportAnswered(db: Db, id: string, staff: string, resolution: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = resolution.trim().slice(0, 500);
  const rows = await db
    .update(schema.supportRequests)
    .set({ status: 'answered', resolution: note || null, resolvedAt: new Date(), resolvedBy: staff })
    .where(and(eq(schema.supportRequests.id, id), eq(schema.supportRequests.status, 'open')))
    .returning({ id: schema.supportRequests.id });
  return rows.length ? { ok: true } : { ok: false, error: 'That request is no longer open (someone may have answered it already).' };
}
