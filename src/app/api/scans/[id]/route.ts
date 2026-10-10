import { PRIVATE_CACHE_CONTROL } from '@/lib/cache-policy';
import { db } from '@/db';
import { isSameOrigin } from '@/lib/security';
import { apiError, privateJson } from '@/modules/personal/routine-http';
import { privateStorage } from '@/modules/scans/private-storage';
import { ID_SHAPE, scanGate, unavailable } from '@/modules/scans/scan-http';
import { deleteScan, getScan } from '@/modules/scans/sessions';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Status only, never the image. 404 for foreign, expired or withdrawn. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await scanGate(request, { admission: false });
  if ('response' in g) return g.response;
  const scan = ID_SHAPE.test(id) ? await getScan(db, g.owner, id) : null;
  return scan ? privateJson({ scan }) : unavailable();
}

/**
 * Revokes the scan and deletes its photo. 204 once nothing of yours remains
 * (also for unknown ids, so they cannot be probed). 202 when storage has
 * not confirmed the photo's deletion: it is retried, and the page must not
 * say it is gone (re-audit A07).
 */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  const { id } = await params;
  const g = await scanGate(request, { admission: false });
  if ('response' in g) return g.response;
  const out = ID_SHAPE.test(id)
    ? await deleteScan(db, privateStorage(), g.owner, id)
    : { found: false, photo: 'none' as const };
  if (out.photo === 'pending') return privateJson({ photo: 'deletion_pending' }, 202);
  return new Response(null, { status: 204, headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL } });
}
