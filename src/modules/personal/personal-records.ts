import { createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import type { ConsentPurpose } from '@/db/schema';
import { ownerColumns, type Owner } from '@/lib/guest-owner';

/**
 * Consent and saved personal records, scoped to one owner.
 *
 * The database enforces the rules (one owner, consent purpose and activity,
 * expiry bounds); these commands are the only intended writers and add the
 * owner scoping every read needs. Server-only.
 */

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Spec section 22: guest saved routines up to 30 days, account routines up to 180. */
export const GUEST_RETENTION_DAYS = 30;
export const ACCOUNT_RETENTION_DAYS = 180;

const ownerFilter = <T extends { userId: unknown; anonymousOwnerHash: unknown }>(table: T, owner: Owner) =>
  owner.kind === 'user'
    ? eq(table.userId as never, owner.userId)
    : eq(table.anonymousOwnerHash as never, owner.ownerHash);

export async function activeConsent(db: Db, owner: Owner, purpose: ConsentPurpose) {
  const [row] = await db
    .select()
    .from(schema.consentRecords)
    .where(
      and(
        ownerFilter(schema.consentRecords, owner),
        eq(schema.consentRecords.purpose, purpose),
        isNull(schema.consentRecords.withdrawnAt)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Grants a purpose. Granting an already active purpose returns the existing grant. */
export async function grantConsent(db: Db, owner: Owner, purpose: ConsentPurpose, policyVersion: string) {
  const existing = await activeConsent(db, owner, purpose);
  if (existing) return existing;
  const [row] = await db
    .insert(schema.consentRecords)
    .values({ ...ownerColumns(owner), purpose, policyVersion })
    .returning();
  return row;
}

/**
 * Withdraws a purpose. Takes effect at once: the database refuses new work
 * under it, and withdrawing photo processing revokes that owner's scans.
 */
export async function withdrawConsent(db: Db, owner: Owner, purpose: ConsentPurpose): Promise<boolean> {
  const rows = await db
    .update(schema.consentRecords)
    .set({ withdrawnAt: new Date() })
    .where(
      and(
        ownerFilter(schema.consentRecords, owner),
        eq(schema.consentRecords.purpose, purpose),
        isNull(schema.consentRecords.withdrawnAt)
      )
    )
    .returning({ id: schema.consentRecords.id });
  return rows.length > 0;
}

/** Stable hash of the answers, for dedupe with the knowledge release. */
export function inputHash(answers: unknown): string {
  const canonical = JSON.stringify(answers, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
  return createHash('sha256').update(canonical).digest('hex');
}

export type SaveRoutineInput = {
  answers: unknown;
  result: unknown;
  engineVersion: string;
  kbRelease: string | null;
  now?: Date;
};

/**
 * Saves a routine and its answers, only under an active routine-saving
 * consent of this owner. Without one, nothing is written: answers are never
 * saved automatically.
 */
export async function saveRoutine(
  db: Db,
  owner: Owner,
  input: SaveRoutineInput
): Promise<{ saved: true; routineId: string } | { saved: false; reason: 'no_consent' }> {
  const consent = await activeConsent(db, owner, 'routine_saving');
  if (!consent) return { saved: false, reason: 'no_consent' };

  const now = input.now ?? new Date();
  const days = owner.kind === 'guest' ? GUEST_RETENTION_DAYS : ACCOUNT_RETENTION_DAYS;
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const owned = ownerColumns(owner);

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(schema.skinProfiles)
      .values({
        ...owned,
        consentId: consent.id,
        schemaVersion: 1,
        answers: input.answers as never,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      })
      .returning({ id: schema.skinProfiles.id });
    const [routine] = await tx
      .insert(schema.routineResults)
      .values({
        ...owned,
        profileId: profile.id,
        consentId: consent.id,
        consentPurpose: 'routine_saving',
        schemaVersion: 1,
        inputHash: inputHash(input.answers),
        kbRelease: input.kbRelease,
        engineVersion: input.engineVersion,
        answers: input.answers as never,
        result: input.result as never,
        createdAt: now,
        expiresAt,
      })
      .returning({ id: schema.routineResults.id });
    return { saved: true as const, routineId: routine.id };
  });
}

/** This owner's unexpired routines under active consent, newest first. Legacy rows never qualify. */
export async function savedRoutines(db: Db, owner: Owner, now = new Date()) {
  const rows = await db
    .select({ routine: schema.routineResults })
    .from(schema.routineResults)
    .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, schema.routineResults.consentId))
    .where(
      and(
        ownerFilter(schema.routineResults, owner),
        isNull(schema.consentRecords.withdrawnAt),
        gt(schema.routineResults.expiresAt, now)
      )
    )
    .orderBy(desc(schema.routineResults.createdAt));
  return rows.map((r) => r.routine);
}
