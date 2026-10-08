import { z } from 'zod';
import { isDatabaseConfigured, db } from '@/db';
import { trustedClientIp } from '@/lib/client-ip';
import { ensureGuestOwnerHash, type Owner } from '@/lib/guest-owner';
import { limit, limitResponse, type LimitCheck } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { grantConsent, withdrawConsent } from '@/modules/personal/personal-records';
import { apiError, limiterSubject, privateJson, resolveOwner } from '@/modules/personal/routine-http';

export const dynamic = 'force-dynamic';

/** Only routine saving is granted here; photo processing belongs to the scan flow. */
const bodySchema = z
  .object({ purpose: z.literal('routine_saving'), policyVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/) })
  .strict();

async function guard(request: Request, owner: Owner | null): Promise<Response | null> {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Unavailable right now.');
  const checks: LimitCheck[] = [{ policy: 'consent', subject: { kind: 'ip', address: trustedClientIp(request.headers) } }];
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
  const grantee: Owner = owner ?? { kind: 'guest', ownerHash: await ensureGuestOwnerHash() };
  const grant = await grantConsent(db, grantee, parsed.data.purpose, parsed.data.policyVersion);
  return privateJson({ consent: { purpose: grant.purpose, policyVersion: grant.policyVersion, grantedAt: grant.grantedAt } }, 201);
}

/** Withdraws routine saving at once: saved routines stop being shown and no new ones are saved. */
export async function DELETE(request: Request) {
  const owner = await resolveOwner();
  const blocked = await guard(request, owner);
  if (blocked) return blocked;
  const withdrawn = owner ? await withdrawConsent(db, owner, 'routine_saving') : false;
  return privateJson({ withdrawn });
}
