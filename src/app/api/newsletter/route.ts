import { z } from 'zod';
import { db, isDatabaseConfigured } from '@/db';
import { apiError, privateJson } from '@/lib/api-response';
import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { after } from 'next/server';
import { enqueue } from '@/infrastructure/jobs/queue';
import { runBackgroundQuietly } from '@/lib/background';
import { NEWSLETTER_CONFIRM_JOB, newsletterEnabled, requestSubscription } from '@/modules/newsletter/newsletter';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    /** Explicit, unticked-by-default agreement to receive the newsletter. */
    consent: z.literal(true),
  })
  .strict();

const ACCEPTED =
  'If that address can be subscribed, we will email a link to confirm. Nothing else is sent until you confirm. If it has not arrived in 15 minutes, sign up again.';

/** Double opt-in sign-up. The same answer whatever the address's state. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!newsletterEnabled() || !isDatabaseConfigured())
    return apiError(503, 'newsletter_unavailable', 'The newsletter is not open yet.');
  const read = await readBoundedJson(request, BODY_LIMITS.newsletter);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.json);
  if (!parsed.success)
    return apiError(400, 'invalid_request', 'Enter a valid email address and tick the box to agree.');
  const limited = await limit([
    { policy: 'newsletter', subject: { kind: 'identifier', value: `newsletter:${parsed.data.email}` } },
    { policy: 'newsletter', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);
  const id = await requestSubscription(db, parsed.data.email);
  // The email goes out through the job queue: retried on provider failure, never claimed as sent here.
  if (id) {
    await enqueue(NEWSLETTER_CONFIRM_JOB, { subscriberId: id }, { dedupeKey: `newsletter:${id}`, maxAttempts: 5 });
    after(runBackgroundQuietly);
  }
  return privateJson({ ok: true, message: ACCEPTED }, 202);
}
