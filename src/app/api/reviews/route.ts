import { auth } from '@/auth';
import { db, isDatabaseConfigured } from '@/db';
import { apiError, privateJson } from '@/lib/api-response';
import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { reviewInputSchema, submitReview } from '@/modules/reviews/reviews';

export const dynamic = 'force-dynamic';

/** A review from an account with a delivered order of the product. Stored for moderation, not published. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Reviews are unavailable right now.');
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return apiError(401, 'sign_in_required', 'Sign in to write a review.');
  const limited = await limit([
    { policy: 'review', subject: { kind: 'user', id: userId } },
    { policy: 'review', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);
  const read = await readBoundedJson(request, BODY_LIMITS.review);
  if (!read.ok) return read.response;
  const parsed = reviewInputSchema.safeParse(read.json);
  if (!parsed.success) {
    return apiError(400, 'invalid_request', 'Choose a rating and write at least 20 characters.', {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  const out = await submitReview(db, userId, parsed.data);
  if (!out.ok) {
    return out.code === 'not_verified'
      ? apiError(403, 'not_verified', 'Reviews are open to customers whose order of this product has been delivered.')
      : apiError(409, 'exists', 'You have already reviewed this product.');
  }
  return privateJson({ ok: true, status: 'pending_moderation' }, 201);
}
