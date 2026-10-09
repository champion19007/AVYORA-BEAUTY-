import { isDatabaseConfigured, db } from '@/db';
import { PRODUCTS } from '@/data/mock-data';
import { trustedClientIp } from '@/lib/client-ip';
import type { Owner } from '@/lib/guest-owner';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { loadActiveRelease } from '@/modules/knowledge/releases';
import { activeConsent } from '@/modules/personal/personal-records';
import { apiError, limiterSubject, privateJson, resolveOwner } from '@/modules/personal/routine-http';
import { getRoutine, insertRoutine, listRoutines, replay, requestHash, scanObservations } from '@/modules/personal/routines';
import { RESULT_MAX_BYTES, routineRequestSchema } from '@/modules/personalization/contracts';
import { computeRoutine } from '@/modules/personalization/core/routine';
import { currentOffers } from '@/modules/personalization/service/offers';

export const dynamic = 'force-dynamic';

const KEY_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Saves a routine. The body carries inputs only (`SkinProfileV2`, the
 * release the browser used, an optional owned scan id); the server
 * recomputes the routine from them with the active release and current
 * prices, so no client result, price or safety decision is ever stored.
 * `Idempotency-Key` is required: a retry returns the original routine, the
 * same key with a different body is a 409.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Saving is unavailable right now.');
  const owner = await resolveOwner();
  if (!owner) return apiError(401, 'owner_required', 'Sign in, or allow routine saving, first.');
  const key = request.headers.get('idempotency-key') ?? '';
  if (!KEY_SHAPE.test(key)) {
    return apiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header of 8 to 128 letters, digits, - or _.');
  }

  const limited = await limit([
    { policy: 'routineSaveMinute', subject: limiterSubject(owner) },
    { policy: 'routineSaveDay', subject: limiterSubject(owner) },
    { policy: 'routineSaveMinute', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const read = await readBoundedJson(request, BODY_LIMITS.routine);
  if (!read.ok) return read.response;
  const parsed = routineRequestSchema.safeParse(read.json);
  if (!parsed.success) {
    return apiError(400, 'invalid_request', 'Some answers are missing or invalid.', {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  const body = parsed.data;

  const prior = await replay(db, owner, key, requestHash(body));
  if (prior && !prior.ok) return apiError(prior.status, prior.code, prior.message);
  if (prior?.ok) return respond(owner, prior.id, 200);

  if (!(await activeConsent(db, owner, 'routine_saving'))) {
    return apiError(403, 'consent_required', 'Saving a routine needs your permission first.');
  }
  const release = await loadActiveRelease(db).catch(() => null);
  if (!release) return apiError(503, 'knowledge_unavailable', 'Routines cannot be saved until a knowledge release is published.');
  if (body.kbRelease !== release.manifest.releaseId) {
    return apiError(409, 'stale_release', 'The routine guidance has been updated; recalculate and try again.', {
      details: { activeRelease: release.manifest.releaseId },
    });
  }

  let observations;
  if (body.scanId) {
    const scan = await scanObservations(db, owner, body.scanId);
    if (!scan.ok) return apiError(scan.status, scan.code, scan.message);
    observations = scan.observations;
  }
  const offers = await currentOffers().catch(() => null);
  if (!offers) return apiError(503, 'pricing_unavailable', 'Prices are unavailable right now; try again shortly.');

  const snapshot = computeRoutine({
    profile: body.profile,
    release,
    products: PRODUCTS,
    offers,
    observations,
    excludeProductIds: body.excludeProductIds,
  });
  if (snapshot.status === 'no_match') {
    return apiError(422, 'no_valid_plan', 'No routine fits these answers yet.', { details: { result: snapshot } });
  }
  // Re-audit A02: a plan that breaks a hard rule is never saved, whatever the browser showed.
  if (snapshot.status === 'invalid' || snapshot.problems.length > 0) {
    return apiError(422, 'invalid_plan', 'This routine breaks a safety rule, so it cannot be saved.', { details: { problems: snapshot.problems } });
  }
  if (JSON.stringify(snapshot).length > RESULT_MAX_BYTES) return apiError(422, 'result_too_large', 'This routine is too large to save.');

  const saved = await insertRoutine(db, owner, { request: body, snapshot, key });
  if (!saved.ok) return apiError(saved.status, saved.code, saved.message);
  return respond(owner, saved.id, saved.replayed ? 200 : 201);
}

async function respond(owner: Owner, id: string, status: number) {
  const routine = await getRoutine(db, owner, id);
  return routine ? privateJson({ routine }, status) : apiError(404, 'not_found', 'That routine is not available.');
}

/** This owner's saved routines that may still be shown, newest first. */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Saved routines are unavailable right now.');
  const owner = await resolveOwner();
  if (!owner) return privateJson({ routines: [] });
  const limited = await limit([
    { policy: 'routineRead', subject: limiterSubject(owner) },
    { policy: 'routineRead', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);
  const ids = await listRoutines(db, owner);
  const routines = (await Promise.all(ids.map((id) => getRoutine(db, owner, id)))).filter((r) => r !== null);
  return privateJson({ routines });
}
