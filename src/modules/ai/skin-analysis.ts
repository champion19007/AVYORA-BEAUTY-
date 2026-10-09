import { and, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { enqueue, PermanentJobError, type JobRow } from '@/infrastructure/jobs/queue';
import type { Owner } from '@/lib/guest-owner';
import { scanResultSchema } from '@/modules/personalization/contracts';
import { MAX_ATTEMPTS_PER_SCAN, recordBillableAttempt } from '@/modules/scans/admission';
import { privateStorage, type PrivateStorage } from '@/modules/scans/private-storage';

/**
 * Hosted photo inference: the lifecycle around a model, not the model.
 *
 * No evaluated, licensed cosmetic model exists, so `configuredSkinAnalyzer()`
 * returns null and nothing is ever queued: uploads stay "analysis
 * unavailable". The exact dependency is a model that (1) has a licence
 * permitting commercial hosted use, (2) has been evaluated on a held-out,
 * person-level split for the specific appearance tasks it reports, with
 * calibrated likelihoods for the knowledge base, and (3) has a pinned
 * version. Until then no score is produced, random or otherwise.
 *
 * When one exists (spec section 19):
 *   - Never on the request path; a job per scan, deduplicated by scan id.
 *   - At most 50 pending scans; then new work is refused with the quiz offered.
 *   - Each attempt is recorded as billable before the provider is called, at
 *     most 2 per scan (DB CHECK), 15 s each, 60 s per scan in total.
 *   - Owner, expiry and consent are re-checked before and after inference;
 *     the status changes are guarded by the consent trigger.
 *   - Output is untrusted: anything that does not parse as bounded
 *     observations from this model version is discarded, never stored.
 *   - The photo is deleted when the scan completes or fails.
 *   - Hard safety answers are never relaxed by photo evidence (the routine
 *     engine treats vision observations as neutral-or-supporting only).
 */

export const SKIN_ANALYSIS_JOB = 'ai.skin_analysis';
export const INFERENCE_TIMEOUT_MS = 15_000;
export const SCAN_DEADLINE_MS = 60_000;
export const MAX_PENDING_SCANS = 50;

export interface SkinImageAnalyzer {
  readonly modelVersion: string;
  /** Returns raw model output; it is validated before anything is kept. */
  analyze(image: Uint8Array, signal: AbortSignal): Promise<unknown>;
}

/** No evaluated model is available; see the module comment for what one needs. */
export function configuredSkinAnalyzer(): SkinImageAnalyzer | null {
  return null;
}

const s = schema.scanSessions;
const PENDING = ['queued', 'processing'];

/** Queues inference for an uploaded scan, if a model exists and the backlog allows. */
export async function requestScanInference(
  owner: Owner,
  scanId: string,
  analyzer: SkinImageAnalyzer | null = configuredSkinAnalyzer(),
  now = new Date()
): Promise<{ ok: true } | { ok: false; code: 'model_unavailable' | 'backlog_full' | 'unavailable' }> {
  if (!analyzer) return { ok: false, code: 'model_unavailable' };
  const [{ n }] = await db.select({ n: count() }).from(s).where(inArray(s.status, PENDING));
  if (Number(n) >= MAX_PENDING_SCANS) return { ok: false, code: 'backlog_full' };
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(s)
      .set({ status: 'queued' })
      .where(and(eq(s.id, scanId), owner.kind === 'user' ? eq(s.userId, owner.userId) : eq(s.anonymousOwnerHash, owner.ownerHash), eq(s.status, 'uploaded'), gt(s.expiresAt, now)))
      .returning({ id: s.id });
    if (!rows.length) return { ok: false as const, code: 'unavailable' as const };
    await enqueue(SKIN_ANALYSIS_JOB, { scanSessionId: scanId }, { tx: tx as never, dedupeKey: `scan:${scanId}`, maxAttempts: MAX_ATTEMPTS_PER_SCAN });
    return { ok: true as const };
  });
}

/** True once the photo is gone. The key is cleared only then, so the retention sweep can retry a failed delete. */
async function deletePhoto(storage: PrivateStorage | null, objectKey: string | null): Promise<boolean> {
  if (!objectKey) return true;
  if (!storage) return false;
  return storage.delete(objectKey).then(() => true, () => false);
}
const cleared = (gone: boolean) => (gone ? { objectKey: null, objectExpiresAt: null } : {});

/** Ends a scan without a result and deletes its photo. Idempotent. */
async function failScan(storage: PrivateStorage | null, scanId: string, objectKey: string | null) {
  const gone = await deletePhoto(storage, objectKey);
  await db
    .update(s)
    .set({ status: 'failed', result: null, ...cleared(gone) })
    .where(and(eq(s.id, scanId), inArray(s.status, ['uploaded', ...PENDING])))
    .catch(() => {});
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run(ctrl.signal),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error('inference timed out'));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function skinAnalysisJobHandler(
  deps: { analyzer?: () => SkinImageAnalyzer | null; storage?: () => PrivateStorage | null; now?: () => Date; timeoutMs?: number } = {}
) {
  const getAnalyzer = deps.analyzer ?? configuredSkinAnalyzer;
  const getStorage = deps.storage ?? privateStorage;
  const clock = deps.now ?? (() => new Date());

  return async (payload: Record<string, unknown>, job?: JobRow) => {
    const scanId = typeof payload.scanSessionId === 'string' ? payload.scanSessionId : null;
    if (!scanId) throw new PermanentJobError('No scan session in the job payload.');
    const storage = getStorage();
    const now = clock();

    // Owner-independent recheck: still pending, unexpired, consent live.
    const [scan] = await db
      .select({ scan: s })
      .from(s)
      .innerJoin(schema.consentRecords, eq(schema.consentRecords.id, s.consentId))
      .where(and(eq(s.id, scanId), inArray(s.status, PENDING), gt(s.expiresAt, now), isNull(schema.consentRecords.withdrawnAt)));
    if (!scan) throw new PermanentJobError('Scan is no longer pending (deleted, expired or consent withdrawn).');
    const { objectKey } = scan.scan;

    const analyzer = getAnalyzer();
    if (!analyzer) {
      await failScan(storage, scanId, objectKey);
      throw new PermanentJobError('No skin analyser is configured.');
    }
    if (job && now.getTime() - job.createdAt.getTime() > SCAN_DEADLINE_MS) {
      await failScan(storage, scanId, objectKey);
      throw new PermanentJobError('Scan deadline passed.');
    }
    const image = objectKey && storage ? await storage.get(objectKey) : null;
    if (!image) {
      await failScan(storage, scanId, objectKey);
      throw new PermanentJobError('The photo is not in private storage.');
    }
    const attempt = await recordBillableAttempt(db as never, scanId);
    if (!attempt.ok) {
      await failScan(storage, scanId, objectKey);
      throw new PermanentJobError('Inference attempts for this scan are used up.');
    }
    // The consent trigger refuses this if consent was withdrawn meanwhile.
    await db.update(s).set({ status: 'processing' }).where(and(eq(s.id, scanId), inArray(s.status, PENDING)));

    let output: unknown;
    try {
      output = await withTimeout((signal) => analyzer.analyze(image, signal), deps.timeoutMs ?? INFERENCE_TIMEOUT_MS);
    } catch (err) {
      if (attempt.attempt >= MAX_ATTEMPTS_PER_SCAN) {
        await failScan(storage, scanId, objectKey);
        throw new PermanentJobError(`Inference failed on the last attempt: ${err instanceof Error ? err.message : 'error'}`);
      }
      await db.update(s).set({ status: 'queued' }).where(and(eq(s.id, scanId), eq(s.status, 'processing')));
      throw err; // transient: the queue retries with backoff
    }

    const parsed = scanResultSchema.safeParse(output);
    if (!parsed.success || parsed.data.observations.some((o) => o.modelVersion !== analyzer.modelVersion)) {
      // Rejected evidence is discarded; the quiz-only routine is unaffected.
      await failScan(storage, scanId, objectKey);
      throw new PermanentJobError('Model output was not valid observations for this model version.');
    }

    // The photo is no longer needed whatever happens next.
    const gone = await deletePhoto(storage, objectKey);
    // Atomic: only a still-processing scan completes; consent is checked by the trigger.
    const done = await db
      .update(s)
      .set({ status: 'completed', result: parsed.data, modelVersion: analyzer.modelVersion, ...cleared(gone) })
      .where(and(eq(s.id, scanId), eq(s.status, 'processing')))
      .returning({ id: s.id })
      .catch(() => []);
    if (!done.length) throw new PermanentJobError('Scan changed during inference (deleted or consent withdrawn); result discarded.');
  };
}
