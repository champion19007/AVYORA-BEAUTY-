import { z } from 'zod';
import { db, isDatabaseConfigured } from '@/db';
import { supportRequests } from '@/db/schema';
import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { apiError, privateJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    message: z.string().trim().min(1).max(2000),
    /** The visitor agreed to be contacted about this request only. */
    contactConsent: z.literal(true),
  })
  .strict();

/**
 * A support request from the landing page's consultation form. Stored for
 * staff to answer by email (admin → Requests); nothing is sent
 * automatically, and no response time is promised because none is
 * confirmed. Same-origin, bounded, rate limited per email and IP. The
 * message is never logged.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  if (!isDatabaseConfigured()) return apiError(503, 'unavailable', 'Requests cannot be sent right now. Please email us instead.');
  const read = await readBoundedJson(request, BODY_LIMITS.support);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.json);
  if (!parsed.success) {
    return apiError(400, 'invalid_request', 'Please check the highlighted fields.', {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }
  const limited = await limit([
    { policy: 'support', subject: { kind: 'identifier', value: `support:${parsed.data.email}` } },
    { policy: 'support', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const [row] = await db
    .insert(supportRequests)
    .values({ name: parsed.data.name, email: parsed.data.email, message: parsed.data.message })
    .returning({ id: supportRequests.id });
  return privateJson({ ok: true, reference: row.id.slice(0, 8).toUpperCase() }, 201);
}
