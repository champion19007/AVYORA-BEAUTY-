import { and, asc, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { ownerColumns, type Owner } from '@/lib/guest-owner';
import { scanResultSchema, type RoutineRequest, type SkinProfileV2 } from '@/modules/personalization/contracts';
import type { Observation } from '@/modules/personalization/core/bayes';
import type { RoutineSnapshot } from '@/modules/personalization/core/routine';
import { ACCOUNT_RETENTION_DAYS, GUEST_RETENTION_DAYS, activeConsent, inputHash } from './personal-records';

/**
 * Saved routines through the API: idempotent creation, owned retrieval
 * with a validity state, deletion, weekly feedback, owned scan observations
 * and the guest-to-account claim. Every function takes the owner and scopes
 * every statement to it; a routine id alone is never permission. Server-only.
 */

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const rr = schema.routineResults;

export type Failure = { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> };
const fail = (status: number, code: string, message: string, details?: Record<string, unknown>): Failure => ({ ok: false, status, code, message, details });

const ownedBy = (owner: Owner) =>
  owner.kind === 'user' ? eq(rr.userId, owner.userId) : eq(rr.anonymousOwnerHash, owner.ownerHash);

/** Hash of the validated request: the same idempotency key with a different hash is a conflict. */
export const requestHash = (request: RoutineRequest) => inputHash(request);

/** The routine an earlier request with this key created, or a conflict if the request differs. */
export async function replay(db: Db, owner: Owner, key: string, hash: string): Promise<{ ok: true; id: string } | Failure | null> {
  const [row] = await db.select({ id: rr.id, requestHash: rr.requestHash }).from(rr).where(and(ownedBy(owner), eq(rr.idempotencyKey, key)));
  if (!row) return null;
  if (row.requestHash !== hash) return fail(409, 'idempotency_conflict', 'This idempotency key was already used for a different request.');
  return { ok: true, id: row.id };
}

/**
 * Observations from a hosted scan this owner owns, completed, unexpired and
 * under live photo consent. Anything else (foreign, missing, expired,
 * withdrawn, unfinished) is the same 404, so ids cannot be probed.
 */
export async function scanObservations(db: Db, owner: Owner, scanId: string, now = new Date()): Promise<{ ok: true; observations: Observation[] } | Failure> {
  const s = schema.scanSessions;
  const [row] = await db
    .select({ result: s.result })
    .from(s)
    .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, s.consentId))
    .where(
      and(
        eq(s.id, scanId),
        owner.kind === 'user' ? eq(s.userId, owner.userId) : eq(s.anonymousOwnerHash, owner.ownerHash),
        eq(s.mode, 'hosted'),
        eq(s.status, 'completed'),
        gt(s.expiresAt, now),
        isNull(schema.consentRecords.withdrawnAt)
      )
    );
  const parsed = scanResultSchema.safeParse(row?.result);
  if (!row || !parsed.success) return fail(404, 'scan_unavailable', 'That scan is not available.');
  return {
    ok: true,
    observations: parsed.data.observations.map((o) => ({
      evidenceGroup: o.evidenceGroup,
      observation: o.state,
      source: 'photo' as const,
      modelVersion: o.modelVersion,
      // 'uncertain' captures are neutral, like rejected ones; only accepted ones count.
      quality: o.quality === 'accepted' ? ('accepted' as const) : ('rejected' as const),
    })),
  };
}

/**
 * Saves a server-computed routine: profile, result snapshot and normalised
 * schedule in one transaction, under an advisory lock on (owner, key) so
 * concurrent retries serialise and the second one replays the first.
 */
export async function insertRoutine(
  db: Db,
  owner: Owner,
  input: { request: RoutineRequest; snapshot: RoutineSnapshot; key: string; now?: Date }
): Promise<{ ok: true; id: string; replayed: boolean } | Failure> {
  const now = input.now ?? new Date();
  const hash = requestHash(input.request);
  const ownerKey = owner.kind === 'user' ? `u:${owner.userId}` : `g:${owner.ownerHash}`;
  const expiresAt = new Date(now.getTime() + (owner.kind === 'guest' ? GUEST_RETENTION_DAYS : ACCOUNT_RETENTION_DAYS) * 86_400_000);
  const owned = ownerColumns(owner);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`routine:${ownerKey}:${input.key}`}, 0))`);
    const prior = await replay(tx as never, owner, input.key, hash);
    if (prior) return prior.ok ? { ...prior, replayed: true } : prior;

    const consent = await activeConsent(tx as never, owner, 'routine_saving');
    if (!consent) return fail(403, 'consent_required', 'Saving a routine needs your permission first.');

    const [profile] = await tx
      .insert(schema.skinProfiles)
      .values({ ...owned, consentId: consent.id, schemaVersion: 2, answers: input.request.profile, createdAt: now, updatedAt: now, expiresAt })
      .returning({ id: schema.skinProfiles.id });
    const [routine] = await tx
      .insert(rr)
      .values({
        ...owned,
        profileId: profile.id,
        consentId: consent.id,
        consentPurpose: 'routine_saving',
        schemaVersion: 2,
        inputHash: inputHash(input.request.profile),
        kbRelease: input.snapshot.kbRelease,
        engineVersion: input.snapshot.engineVersion,
        inferenceVersion: input.snapshot.inferenceVersion,
        modelVersion: input.snapshot.modelVersions.join(',') || null,
        idempotencyKey: input.key,
        requestHash: hash,
        answers: input.request.profile,
        result: input.snapshot,
        createdAt: now,
        expiresAt,
      })
      .returning({ id: rr.id });
    const slots = input.snapshot.days.flatMap((d) =>
      (['am', 'pm'] as const).flatMap((session) =>
        d[session].map((s) => ({
          routineId: routine.id,
          day: d.day,
          session,
          position: s.position,
          role: s.role,
          optional: s.optional,
          productId: s.productId ?? null,
          skuId: s.skuId ?? null,
          ownedItemId: s.ownedItemId ?? null,
        }))
      )
    );
    if (slots.length) await tx.insert(schema.routineScheduleSlots).values(slots);
    return { ok: true as const, id: routine.id, replayed: false };
  });
}

export type Validity = 'current' | 'outdated' | 'revoked';

/**
 * An owned routine that may still be shown: saved through the versioned
 * path, unexpired, under live consent. Its validity says whether its
 * knowledge release is still the active one (`current`), superseded
 * (`outdated`, recompute to refresh) or revoked (`revoked`, never present
 * it as a recommendation). The schedule is read from the normalised rows.
 */
export async function getRoutine(db: Db, owner: Owner, id: string, now = new Date()) {
  const [row] = await db
    .select({ routine: rr, releaseStatus: schema.kbReleases.status, activeId: schema.kbActiveRelease.releaseId })
    .from(rr)
    .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, rr.consentId))
    .leftJoin(schema.kbReleases, eq(schema.kbReleases.id, rr.kbRelease))
    .leftJoin(schema.kbActiveRelease, eq(schema.kbActiveRelease.singleton, true))
    .where(and(eq(rr.id, id), ownedBy(owner), gte(rr.schemaVersion, 2), gt(rr.expiresAt, now), isNull(schema.consentRecords.withdrawnAt)));
  if (!row) return null;
  const slots = await db
    .select()
    .from(schema.routineScheduleSlots)
    .where(eq(schema.routineScheduleSlots.routineId, id))
    .orderBy(asc(schema.routineScheduleSlots.day), asc(schema.routineScheduleSlots.session), asc(schema.routineScheduleSlots.position));
  const validity: Validity =
    row.releaseStatus === 'revoked' || row.releaseStatus === null ? 'revoked' : row.activeId === row.routine.kbRelease ? 'current' : 'outdated';
  return {
    id: row.routine.id,
    createdAt: row.routine.createdAt.toISOString(),
    expiresAt: row.routine.expiresAt!.toISOString(),
    validity,
    // A revoked release's result stays for traceability but is never offered as the plan.
    result: validity === 'revoked' ? null : (row.routine.result as RoutineSnapshot),
    kbRelease: row.routine.kbRelease!,
    /** The owner's own saved answers, so an outdated routine can be recalculated. */
    profile: row.routine.answers as SkinProfileV2,
    schedule: slots.map(({ routineId: _routineId, ...s }) => s),
  };
}

/** Ids of this owner's showable routines, newest first. */
export async function listRoutines(db: Db, owner: Owner, now = new Date()) {
  const rows = await db
    .select({ id: rr.id })
    .from(rr)
    .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, rr.consentId))
    .where(and(ownedBy(owner), gte(rr.schemaVersion, 2), gt(rr.expiresAt, now), isNull(schema.consentRecords.withdrawnAt)))
    .orderBy(sql`${rr.createdAt} DESC`)
    .limit(50);
  return rows.map((r) => r.id);
}

/** Deletes an owned routine with its saved answers, schedule and feedback. Idempotent. */
export async function deleteRoutine(db: Db, owner: Owner, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [gone] = await tx.delete(rr).where(and(eq(rr.id, id), ownedBy(owner), gte(rr.schemaVersion, 1))).returning({ profileId: rr.profileId });
    if (gone?.profileId) {
      await tx.delete(schema.skinProfiles).where(and(eq(schema.skinProfiles.id, gone.profileId), owner.kind === 'user' ? eq(schema.skinProfiles.userId, owner.userId) : eq(schema.skinProfiles.anonymousOwnerHash, owner.ownerHash)));
    }
  });
}

/** Weekly feedback on an owned, showable routine. Accounts only (the table requires a user). */
export async function addFeedback(
  db: Db,
  userId: string,
  routineId: string,
  input: { week: number; adherence: string; tolerability: string; reportedChange: string; kbRelease: string },
  now = new Date()
): Promise<{ ok: true } | Failure> {
  const routine = await getRoutine(db, { kind: 'user', userId }, routineId, now);
  if (!routine) return fail(404, 'not_found', 'That routine is not available.');
  if (routine.kbRelease !== input.kbRelease) return fail(409, 'stale_routine', 'This routine has changed; reload it before sending feedback.');
  const inserted = await db
    .insert(schema.routineFeedback)
    .values({ routineId, userId, week: input.week, adherence: input.adherence, tolerability: input.tolerability, reportedChange: input.reportedChange })
    .onConflictDoNothing()
    .returning({ id: schema.routineFeedback.id });
  if (!inserted.length) return fail(409, 'feedback_exists', 'Feedback for that week was already sent.');
  return { ok: true };
}

/**
 * Moves everything a guest owns to the account that has just proved it
 * holds the guest secret, atomically. Consent records are append-only, so
 * each active guest grant is carried over as a new account grant under the
 * same policy version (unless the account already has one), the records are
 * pointed at it, and the guest grant is withdrawn. Expiry dates are kept.
 * Idempotent: a second claim finds nothing left to move.
 */
export async function claimGuestRecords(db: Db, userId: string, ownerHash: string): Promise<{ moved: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`claim:${ownerHash}`}, 0))`);
    const c = schema.consentRecords;
    const grants = await tx.select().from(c).where(and(eq(c.anonymousOwnerHash, ownerHash), isNull(c.withdrawnAt)));
    let moved = 0;

    // An idempotency key the account already used would collide; the guest copy loses its key.
    await tx.execute(sql`
      UPDATE routine_results g SET idempotency_key = NULL, request_hash = NULL
      WHERE g.anonymous_owner_hash = ${ownerHash} AND g.idempotency_key IN (
        SELECT idempotency_key FROM routine_results WHERE user_id = ${userId} AND idempotency_key IS NOT NULL)`);

    for (const grant of grants) {
      const [existing] = await tx.select().from(c).where(and(eq(c.userId, userId), eq(c.purpose, grant.purpose), isNull(c.withdrawnAt)));
      const target =
        existing ?? (await tx.insert(c).values({ userId, purpose: grant.purpose, policyVersion: grant.policyVersion }).returning())[0];
      const to = { userId, anonymousOwnerHash: null, consentId: target.id };
      for (const table of [schema.skinProfiles, schema.routineResults, schema.scanSessions] as const) {
        const rows = await tx
          .update(table)
          .set(to)
          .where(and(eq(table.anonymousOwnerHash, ownerHash), eq(table.consentId, grant.id)))
          .returning({ id: table.id });
        moved += rows.length;
      }
      await tx.update(c).set({ withdrawnAt: new Date() }).where(eq(c.id, grant.id));
    }
    return { moved };
  });
}

/** Deletes versioned routines and saved answers past their expiry. Run by the daily sweep. */
export async function purgeExpiredRoutines(db: Db, now = new Date()): Promise<number> {
  const routines = await db.delete(rr).where(and(gte(rr.schemaVersion, 1), isNotNull(rr.expiresAt), sql`${rr.expiresAt} <= ${now}`)).returning({ id: rr.id });
  await db.delete(schema.skinProfiles).where(sql`${schema.skinProfiles.expiresAt} <= ${now}`);
  return routines.length;
}
