import { and, count, eq, gte, max, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { ownerColumns, type Owner } from '@/lib/guest-owner';
import { keyedHash } from '@/lib/rate-limit';

/**
 * Hosted scan admission: the spend cap, kept durable.
 *
 * Budgets (spec section 21, starting settings): per owner 3 per UTC day and
 * 10 per rolling 30 days; a soft per-IP ceiling of 20 per UTC day; 100
 * hosted scans per UTC day across everyone. Counted from `scan_admissions`
 * rows, inside one transaction serialised by an advisory lock, so concurrent
 * requests on any number of instances cannot overshoot. Admissions are rare
 * (at most 100 a day), so one lock costs nothing measurable.
 *
 * Fails closed: if anything goes wrong, nothing is admitted.
 */

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type ScanQuotas = { perOwnerDay: number; perOwner30Days: number; perIpDay: number; globalDay: number };
export const SCAN_QUOTAS: ScanQuotas = { perOwnerDay: 3, perOwner30Days: 10, perIpDay: 20, globalDay: 100 };

/** Billable inference attempts per scan (also enforced by a database CHECK). */
export const MAX_ATTEMPTS_PER_SCAN = 2;

const ADMISSION_LOCK = 0x5ca9_ad31;

export type AdmissionResult =
  | { admitted: true; scanSessionId: string }
  | { admitted: false; reason: 'owner_daily' | 'owner_30_days' | 'ip_daily' | 'global_daily' | 'no_consent' | 'unavailable' };

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export async function admitHostedScan(
  db: Db,
  input: { owner: Owner; ipAddress: string | null; consentId: string; now?: Date; quotas?: ScanQuotas }
): Promise<AdmissionResult> {
  const now = input.now ?? new Date();
  const quotas = input.quotas ?? SCAN_QUOTAS;
  const owned = ownerColumns(input.owner);
  const ipKey = input.ipAddress ? keyedHash(`ip:${input.ipAddress}`) : null;
  const ownerMatch =
    input.owner.kind === 'user'
      ? eq(schema.scanAdmissions.userId, input.owner.userId)
      : eq(schema.scanAdmissions.anonymousOwnerHash, input.owner.ownerHash);
  const dayStart = startOfUtcDay(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const counted = async (tx: Db, where: ReturnType<typeof and>) =>
    Number((await tx.select({ n: count() }).from(schema.scanAdmissions).where(where))[0]?.n ?? 0);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMISSION_LOCK})`);

      if ((await counted(tx as never, and(gte(schema.scanAdmissions.admittedAt, dayStart)))) >= quotas.globalDay) {
        return { admitted: false as const, reason: 'global_daily' as const };
      }
      if ((await counted(tx as never, and(ownerMatch, gte(schema.scanAdmissions.admittedAt, dayStart)))) >= quotas.perOwnerDay) {
        return { admitted: false as const, reason: 'owner_daily' as const };
      }
      if ((await counted(tx as never, and(ownerMatch, gte(schema.scanAdmissions.admittedAt, thirtyDaysAgo)))) >= quotas.perOwner30Days) {
        return { admitted: false as const, reason: 'owner_30_days' as const };
      }
      if (
        ipKey &&
        (await counted(tx as never, and(eq(schema.scanAdmissions.ipKey, ipKey), gte(schema.scanAdmissions.admittedAt, dayStart)))) >= quotas.perIpDay
      ) {
        return { admitted: false as const, reason: 'ip_daily' as const };
      }

      // The consent trigger (migration 0016) refuses a withdrawn or foreign consent.
      const [scan] = await tx
        .insert(schema.scanSessions)
        .values({
          ...owned,
          consentId: input.consentId,
          mode: 'hosted',
          createdAt: now,
          expiresAt: new Date(now.getTime() + 7 * 86_400_000),
        })
        .returning({ id: schema.scanSessions.id });
      await tx.insert(schema.scanAdmissions).values({ ...owned, scanSessionId: scan.id, ipKey, admittedAt: now });
      return { admitted: true as const, scanSessionId: scan.id };
    });
  } catch (err) {
    if (err instanceof Error && /consent/.test(err.message + String((err as { cause?: unknown }).cause ?? ''))) {
      return { admitted: false, reason: 'no_consent' };
    }
    return { admitted: false, reason: 'unavailable' };
  }
}

/**
 * Records the next billable attempt for a scan, or refuses once the budget is
 * spent. Call before starting inference; a refusal means do not call the provider.
 */
export async function recordBillableAttempt(db: Db, scanSessionId: string): Promise<{ ok: true; attempt: number } | { ok: false }> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ last: max(schema.scanAttempts.attempt) })
        .from(schema.scanAttempts)
        .where(eq(schema.scanAttempts.scanSessionId, scanSessionId));
      const attempt = Number(row?.last ?? 0) + 1;
      if (attempt > MAX_ATTEMPTS_PER_SCAN) return { ok: false as const };
      await tx.insert(schema.scanAttempts).values({ scanSessionId, attempt });
      return { ok: true as const, attempt };
    });
  } catch {
    // A concurrent duplicate (primary key) or the CHECK: either way, not billable.
    return { ok: false };
  }
}
