import { isDatabaseConfigured } from '@/db';
import { trustedClientIp } from '@/lib/client-ip';
import type { Owner } from '@/lib/guest-owner';
import { limit, limitResponse } from '@/lib/rate-limit';
import { apiError, limiterSubject, resolveOwner } from '@/modules/personal/routine-http';
import { IMAGE_PROBLEM_TEXT } from './image-validation';
import type { ScanFailure } from './sessions';

/**
 * Shared gate for the hosted scan routes. Off unless FACE_SCAN_HOSTED=1
 * (a reversible server flag) and a database exists. Hosted scans need a
 * signed-in account: a photo is never tied to a guest cookie.
 */
export const hostedScansEnabled = () => process.env.FACE_SCAN_HOSTED === '1' && isDatabaseConfigured();

export const ID_SHAPE = /^[0-9a-f-]{36}$/;
export const unavailable = () =>
  apiError(
    404,
    'not_found',
    'That scan is not available. Scans expire, and can only be opened by the account that started them.'
  );

/**
 * `admission`: starting or uploading needs the hosted flag. Privacy actions
 * (status, delete) need only a database and the owner, so a customer can
 * always see and delete their photo after the feature is switched off.
 */
export async function scanGate(
  request: Request,
  opts: { admission: boolean }
): Promise<{ owner: Owner; ip: string | null } | { response: Response }> {
  if (opts.admission ? !hostedScansEnabled() : !isDatabaseConfigured()) {
    return {
      response: apiError(503, 'scan_disabled', 'Photo analysis is not available. The questionnaire works without it.'),
    };
  }
  const owner = await resolveOwner();
  if (owner?.kind !== 'user') return { response: apiError(401, 'sign_in_required', 'Sign in to use a photo.') };
  const ip = trustedClientIp(request.headers);
  const limited = await limit([
    { policy: 'scanStatus', subject: limiterSubject(owner) },
    { policy: 'scanStatus', subject: { kind: 'ip', address: ip } },
  ]);
  if (!limited.allowed) return { response: limitResponse(limited) };
  return { owner, ip };
}

export function failureResponse(f: ScanFailure): Response {
  switch (f.code) {
    case 'consent_required':
      return apiError(403, 'consent_required', 'Photo processing needs your permission first.');
    case 'quota':
      return apiError(
        429,
        'scan_quota',
        'You have reached the number of photo checks allowed for now. The questionnaire works without one.'
      );
    case 'invalid_image':
      return apiError(422, f.problem, IMAGE_PROBLEM_TEXT[f.problem]);
    case 'wrong_state':
      return apiError(409, 'wrong_state', 'This scan already has a photo. Start a new one to try again.');
    case 'unavailable':
      return unavailable();
    default:
      return apiError(503, f.code, 'Photo analysis is not available right now.');
  }
}
