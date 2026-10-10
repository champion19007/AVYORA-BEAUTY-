import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import type { Owner } from '@/lib/guest-owner';
import { activeConsent } from '@/modules/personal/personal-records';
import { admitHostedScan } from './admission';
import { stagedObjectKey, type PrivateStorage } from './private-storage';
import { validateAndReencode } from './reencode';
import type { ImageProblem } from './image-validation';
import { reportError } from '@/lib/observability';

/**
 * Hosted scan sessions: owned, expiring, under a live photo-processing
 * consent. Every operation re-checks owner, consent and expiry; a foreign,
 * expired, withdrawn or missing session is the same "unavailable", so ids
 * cannot be probed. Images go to private storage under a server-generated
 * key, after validation and a metadata-stripping re-encode, and live there
 * for at most 24 hours (database CHECK).
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const s = schema.scanSessions;
const OBJECT_TTL_MS = 24 * 3_600_000;
/** An unreferenced object younger than this may belong to an upload still in progress. */
const ORPHAN_GRACE_MS = 15 * 60_000;

export type ScanFailure =
  | {
      ok: false;
      code:
        'consent_required' | 'unavailable' | 'quota' | 'storage_unavailable' | 'wrong_state' | 'service_unavailable';
      detail?: string;
    }
  | { ok: false; code: 'invalid_image'; problem: ImageProblem };

const ownedBy = (owner: Owner) =>
  owner.kind === 'user' ? eq(s.userId, owner.userId) : eq(s.anonymousOwnerHash, owner.ownerHash);

/** Creates a session if consent is active and the durable owner, IP and global quotas allow. */
export async function createHostedScan(
  db: Db,
  owner: Owner,
  ipAddress: string | null,
  now = new Date()
): Promise<{ ok: true; id: string; expiresAt: Date } | ScanFailure> {
  const consent = await activeConsent(db, owner, 'photo_processing');
  if (!consent) return { ok: false, code: 'consent_required' };
  const admitted = await admitHostedScan(db, { owner, ipAddress, consentId: consent.id, now });
  if (!admitted.admitted) {
    if (admitted.reason === 'no_consent') return { ok: false, code: 'consent_required' };
    if (admitted.reason === 'unavailable') return { ok: false, code: 'service_unavailable' };
    return { ok: false, code: 'quota', detail: admitted.reason };
  }
  const [row] = await db.select({ expiresAt: s.expiresAt }).from(s).where(eq(s.id, admitted.scanSessionId));
  return { ok: true, id: admitted.scanSessionId, expiresAt: row.expiresAt };
}

/** The owner's live session (unexpired, consent not withdrawn), or null. */
async function liveSession(db: Db, owner: Owner, id: string, now: Date) {
  const [row] = await db
    .select({ scan: s })
    .from(s)
    .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, s.consentId))
    .where(and(eq(s.id, id), ownedBy(owner), gt(s.expiresAt, now), isNull(schema.consentRecords.withdrawnAt)));
  return row?.scan ?? null;
}

/** Validates, re-encodes and privately stores the image, then marks the session uploaded. */
export async function uploadScanImage(
  db: Db,
  storage: PrivateStorage | null,
  owner: Owner,
  id: string,
  bytes: Uint8Array,
  now = new Date()
): Promise<{ ok: true; status: 'uploaded'; width: number; height: number } | ScanFailure> {
  if (!storage) return { ok: false, code: 'storage_unavailable' };
  const scan = await liveSession(db, owner, id, now);
  if (!scan) return { ok: false, code: 'unavailable' };
  if (scan.status !== 'created') return { ok: false, code: 'wrong_state' };
  const checked = await validateAndReencode(bytes);
  if (!checked.ok) return { ok: false, code: 'invalid_image', problem: checked.problem };
  // This request's own staged object: if another upload wins the race, only these bytes are deleted.
  const key = stagedObjectKey(id);
  await storage.put(key, checked.jpeg, 'image/jpeg');
  const discardOwn = () => storage.delete(key).catch((err) => reportError(err, { scope: 'scans.discardStaged' }));
  try {
    // The consent trigger re-checks consent on this status change.
    const rows = await db
      .update(s)
      .set({
        status: 'uploaded',
        objectKey: key,
        objectExpiresAt: new Date(Math.min(now.getTime() + OBJECT_TTL_MS, scan.createdAt.getTime() + OBJECT_TTL_MS)),
        quality: {
          width: checked.width,
          height: checked.height,
          brightness: Math.round(checked.brightness),
          contrast: Math.round(checked.contrast),
        },
      })
      .where(and(eq(s.id, id), eq(s.status, 'created')))
      .returning({ id: s.id });
    if (!rows.length) {
      await discardOwn();
      return { ok: false, code: 'wrong_state' };
    }
  } catch {
    // Consent withdrawn between the check and the update: nothing may be kept.
    await discardOwn();
    return { ok: false, code: 'unavailable' };
  }
  return { ok: true, status: 'uploaded', width: checked.width, height: checked.height };
}

/** Status for the owner: never the image, never an object key. */
export async function getScan(db: Db, owner: Owner, id: string, now = new Date()) {
  const scan = await liveSession(db, owner, id, now);
  if (!scan) return null;
  return {
    id: scan.id,
    status: scan.status,
    mode: scan.mode,
    modelVersion: scan.modelVersion,
    result: scan.result,
    expiresAt: scan.expiresAt.toISOString(),
  };
}

/**
 * Owner deletion. The scan is revoked first (no further work, no result),
 * then the photo is deleted; `photo` says whether storage confirmed it.
 * A failed delete keeps the key so the retention sweep retries it, and the
 * caller must not report the photo as gone (re-audit A07).
 */
export async function deleteScan(
  db: Db,
  storage: PrivateStorage | null,
  owner: Owner,
  id: string
): Promise<{ found: boolean; photo: 'deleted' | 'none' | 'pending' }> {
  const [scan] = await db
    .select()
    .from(s)
    .where(and(eq(s.id, id), ownedBy(owner)));
  if (!scan) return { found: false, photo: 'none' };
  await db.update(s).set({ status: 'revoked', result: null, quality: null }).where(eq(s.id, id));
  if (!scan.objectKey) return { found: true, photo: 'none' };
  return { found: true, photo: (await removePhoto(db, storage, id, scan.objectKey)) ? 'deleted' : 'pending' };
}

/** Deletes a stored photo and clears its key only once storage confirms. False leaves it for the sweep. */
async function removePhoto(db: Db, storage: PrivateStorage | null, id: string, key: string): Promise<boolean> {
  if (!storage) return false;
  try {
    await storage.delete(key);
  } catch (err) {
    reportError(err, { scope: 'scans.deletePhoto' });
    return false;
  }
  await db
    .update(s)
    .set({ objectKey: null, objectExpiresAt: null })
    .where(and(eq(s.id, id), eq(s.objectKey, key)));
  return true;
}

/**
 * Ends an uploaded scan that no analysis will process (no model, or the
 * queue is full) and deletes its photo at once, rather than keeping it
 * until a scheduled sweep (re-audit A06).
 */
export async function discardUnprocessedPhoto(db: Db, storage: PrivateStorage | null, id: string): Promise<boolean> {
  const [row] = await db
    .update(s)
    .set({ status: 'failed', result: null })
    .where(and(eq(s.id, id), eq(s.status, 'uploaded')))
    .returning({ key: s.objectKey });
  if (!row?.key) return true;
  return removePhoto(db, storage, id, row.key);
}

/**
 * After photo consent is withdrawn: the database trigger has already revoked
 * the owner's scans but kept their object keys; this deletes every photo the
 * owner still has stored, now. A storage failure leaves the key in
 * place for the retention sweep to retry; the database never claims a
 * deletion that did not happen.
 */
export async function purgeOwnerScans(
  db: Db,
  storage: PrivateStorage | null,
  owner: Owner
): Promise<{ deleted: number; pending: number }> {
  const rows = await db
    .select({ id: s.id })
    .from(s)
    .where(and(ownedBy(owner), isNotNull(s.objectKey)));
  let deleted = 0;
  let pending = 0;
  for (const r of rows) {
    try {
      if ((await deleteScan(db, storage, owner, r.id)).photo === 'pending') pending += 1;
      else deleted += 1;
    } catch (err) {
      pending += 1;
      reportError(err, { scope: 'scans.purge' });
    }
  }
  return { deleted, pending };
}

/**
 * Retention sweep, run by the cron sweep. Retryable and batched:
 *   1. Deletes every photo whose 24 hours are up, or whose scan has ended
 *      (revoked, failed, expired, completed), clearing the key only after
 *      storage confirms the delete.
 *   2. Deletes scan rows (observations included) past their 7-day expiry,
 *      once no photo remains. Admission counts live in their own table, so
 *      quotas are unaffected.
 * Without storage configured nothing can be deleted: photos stay listed
 * as overdue, which the system page shows.
 */
export async function sweepScans(db: Db, storage: PrivateStorage | null, now = new Date(), batch = 100) {
  let photosDeleted = 0;
  let photoFailures = 0;
  let orphansDeleted = 0;
  let orphanFailures = 0;
  if (storage) {
    const due = await db
      .select({ id: s.id, key: s.objectKey })
      .from(s)
      .where(
        and(
          isNotNull(s.objectKey),
          sql`(${s.objectExpiresAt} <= ${now} OR ${s.status} IN ('revoked', 'failed', 'expired', 'completed'))`
        )
      )
      .limit(batch);
    for (const row of due) {
      if (await removePhoto(db, storage, row.id, row.key!)) photosDeleted += 1;
      else photoFailures += 1;
    }
    // Objects no row points at (a request that crashed between storing and recording): removed after a grace period.
    const referenced = new Set(
      (await db.select({ key: s.objectKey }).from(s).where(isNotNull(s.objectKey))).map((r) => r.key)
    );
    for (const o of await storage.list().catch(() => [])) {
      if (referenced.has(o.key) || now.getTime() - o.modifiedAt.getTime() < ORPHAN_GRACE_MS) continue;
      try {
        await storage.delete(o.key);
        orphansDeleted += 1;
      } catch {
        orphanFailures += 1;
      }
    }
  }
  const expired = await db
    .delete(s)
    .where(and(isNull(s.objectKey), sql`${s.expiresAt} <= ${now}`))
    .returning({ id: s.id });
  return { photosDeleted, photoFailures, orphansDeleted, orphanFailures, scansDeleted: expired.length };
}

/** For the system page: work pending and photos past their deletion time. */
export async function scanHealth(db: Db, now = new Date()) {
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${s.status} in ('queued', 'processing'))`,
      overduePhotos: sql<number>`count(*) filter (where ${s.objectKey} is not null and ${s.objectExpiresAt} <= ${now})`,
      oldestOverdue: sql<
        string | null
      >`min(${s.objectExpiresAt}) filter (where ${s.objectKey} is not null and ${s.objectExpiresAt} <= ${now})`,
      failed24h: sql<number>`count(*) filter (where ${s.status} = 'failed' and ${s.createdAt} > ${new Date(now.getTime() - 86_400_000)})`,
    })
    .from(s);
  const oldest = row.oldestOverdue ? new Date(row.oldestOverdue).getTime() : null;
  return {
    pending: Number(row.pending),
    overduePhotos: Number(row.overduePhotos),
    /** How late the most overdue photo is: the number to alert on. */
    maxLatenessMinutes: oldest === null ? 0 : Math.max(0, Math.round((now.getTime() - oldest) / 60_000)),
    failed24h: Number(row.failed24h),
  };
}
