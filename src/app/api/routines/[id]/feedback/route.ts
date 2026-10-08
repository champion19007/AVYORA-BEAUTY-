import { isDatabaseConfigured, db } from '@/db';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { apiError, privateJson, resolveOwner } from '@/modules/personal/routine-http';
import { addFeedback } from '@/modules/personal/routines';
import { feedbackRequestSchema } from '@/modules/personalization/contracts';

export const dynamic = 'force-dynamic';

/** Weekly feedback on an owned routine: bounded enums only, accounts only, once per week. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Feedback is unavailable right now.');
  const owner = await resolveOwner();
  if (owner?.kind !== 'user') return apiError(401, 'account_required', 'Sign in to send feedback.');
  const limited = await limit([{ policy: 'feedback', subject: { kind: 'user', id: owner.userId } }]);
  if (!limited.allowed) return limitResponse(limited);

  const read = await readBoundedJson(request, BODY_LIMITS.feedback);
  if (!read.ok) return read.response;
  const parsed = feedbackRequestSchema.safeParse(read.json);
  if (!parsed.success) {
    return apiError(400, 'invalid_request', 'Feedback is missing or invalid.', {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, 'not_found', 'That routine is not available.');
  const result = await addFeedback(db, owner.userId, id, parsed.data);
  return result.ok ? privateJson({ ok: true }, 201) : apiError(result.status, result.code, result.message);
}
