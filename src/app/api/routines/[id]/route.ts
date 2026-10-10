import { isDatabaseConfigured, db } from '@/db';
import { PRIVATE_CACHE_CONTROL } from '@/lib/cache-policy';
import { trustedClientIp } from '@/lib/client-ip';
import { limit, limitResponse } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/security';
import { apiError, limiterSubject, privateJson, resolveOwner } from '@/modules/personal/routine-http';
import { deleteRoutine, getRoutine } from '@/modules/personal/routines';

export const dynamic = 'force-dynamic';

const ID_SHAPE = /^[0-9a-f-]{36}$/;
type Ctx = { params: Promise<{ id: string }> };
const gone = () => new Response(null, { status: 204, headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL } });
const notFound = () => apiError(404, 'not_found', 'That routine is not available.');

async function gate(request: Request) {
  if (!isDatabaseConfigured())
    return { response: apiError(503, 'unavailable', 'Saved routines are unavailable right now.') };
  const owner = await resolveOwner();
  if (!owner) return { response: null };
  const limited = await limit([
    { policy: 'routineRead', subject: limiterSubject(owner) },
    { policy: 'routineRead', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
  ]);
  if (!limited.allowed) return { response: limitResponse(limited) };
  return { owner };
}

/** An owned routine and whether its knowledge is current, outdated or revoked. 404 for foreign, expired or withdrawn. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await gate(request);
  if (!g.owner) return g.response ?? notFound();
  const routine = ID_SHAPE.test(id) ? await getRoutine(db, g.owner, id) : null;
  return routine ? privateJson({ routine }) : notFound();
}

/** Deletes an owned routine with its saved answers, schedule and feedback. Always 204, so ids cannot be probed. */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  const { id } = await params;
  const g = await gate(request);
  if (!g.owner) return g.response ?? gone();
  if (ID_SHAPE.test(id)) await deleteRoutine(db, g.owner, id);
  return gone();
}
