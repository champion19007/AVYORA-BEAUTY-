import { z } from 'zod';
import { isDatabaseConfigured, db } from '@/db';
import { trustedClientIp } from '@/lib/client-ip';
import { ensureGuestOwnerHash, type Owner } from '@/lib/guest-owner';
import { limit, limitResponse, type LimitCheck } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { grantConsent, withdrawConsent } from '@/modules/personal/personal-records';
import { privateStorage } from '@/modules/scans/private-storage';
import { hostedScansEnabled } from '@/modules/scans/scan-http';
import { purgeOwnerScans } from '@/modules/scans/sessions';
import { apiError, limiterSubject, privateJson, resolveOwner } from '@/modules/personal/routine-http';

export const dynamic = 'force-dynamic';

/**
 * Routine saving (guests too), and photo processing (signed-in accounts only,
 * and only while hosted scans are switched on). Other purposes stay closed.
 */
const PURPOSE = z.enum(['routine_saving', 'photo_processing']);
const bodySchema = z.object({ purpose: PURPOSE, policyVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/) }).strict();

async function guard(request: Request, owner: Owner | null): Promise<Response | null> {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Unavailable right now.');
  const checks: LimitCheck[] = [
    { policy: 'consent', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ];
  if (owner) checks.push({ policy: 'consent', subject: limiterSubject(owner) });
  const limited = await limit(checks);
  return limited.allowed ? null : limitResponse(limited);
}

/** Grants routine saving. A guest without an owner cookie gets one now (HttpOnly; only its hash is stored). */
export async function POST(request: Request) {
  const owner = await resolveOwner();
  const blocked = await guard(request, owner);
  if (blocked) return blocked;
  const read = await readBoundedJson(request, BODY_LIMITS.consent);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.json);
  if (!parsed.success) return apiError(400, 'invalid_request', 'Unknown consent purpose or policy version.');
  if (parsed.data.purpose === 'photo_processing') {
    if (!hostedScansEnabled()) return apiError(503, 'scan_disabled', 'Photo analysis is not available.');
    if (owner?.kind !== 'user') return apiError(401, 'sign_in_required', 'Sign in to allow photo processing.');
  }
  const grantee: Owner = owner ?? { kind: 'guest', ownerHash: await ensureGuestOwnerHash() };
  const grant = await grantConsent(db, grantee, parsed.data.purpose, parsed.data.policyVersion);
  return privateJson(
    { consent: { purpose: grant.purpose, policyVersion: grant.policyVersion, grantedAt: grant.grantedAt } },
    201
  );
}

/**
 * Withdraws a permission at once (`?purpose=`, default routine saving).
 * Routine saving: saved routines stop being shown. Photo processing: pending
 * scans stop, and their photos are deleted.
 */
export async function DELETE(request: Request) {
  const owner = await resolveOwner();
  const blocked = await guard(request, owner);
  if (blocked) return blocked;
  const purpose = PURPOSE.safeParse(new URL(request.url).searchParams.get('purpose') ?? 'routine_saving');
  if (!purpose.success) return apiError(400, 'invalid_request', 'Unknown consent purpose.');
  const withdrawn = owner ? await withdrawConsent(db, owner, purpose.data) : false;
  // Photo deletion is reported as it happened: pending deletions are retried by the retention sweep.
  const photos =
    owner && purpose.data === 'photo_processing' ? await purgeOwnerScans(db, privateStorage(), owner) : null;
  return privateJson({
    withdrawn,
    ...(photos ? { photosDeleted: photos.deleted, photoDeletionsPending: photos.pending } : {}),
  });
}
