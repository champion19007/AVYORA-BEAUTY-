import { db } from '@/db';
import { isSameOrigin } from '@/lib/security';
import { apiError, privateJson } from '@/modules/personal/routine-http';
import { failureResponse, scanGate } from '@/modules/scans/scan-http';
import { createHostedScan } from '@/modules/scans/sessions';

export const dynamic = 'force-dynamic';

/** Starts a hosted scan session: signed-in, live photo consent, within the durable quotas. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  const g = await scanGate(request, { admission: true });
  if ('response' in g) return g.response;
  const created = await createHostedScan(db, g.owner, g.ip);
  if (!created.ok) return failureResponse(created);
  return privateJson({ scan: { id: created.id, status: 'created', expiresAt: created.expiresAt.toISOString() } }, 201);
}
