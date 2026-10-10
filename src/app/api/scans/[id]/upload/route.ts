import { db } from '@/db';
import { requestScanInference } from '@/modules/ai/skin-analysis';
import { BODY_LIMITS, readBoundedBytes } from '@/lib/request-body';
import { isSameOrigin } from '@/lib/security';
import { apiError, privateJson } from '@/modules/personal/routine-http';
import { privateStorage } from '@/modules/scans/private-storage';
import { failureResponse, ID_SHAPE, scanGate, unavailable } from '@/modules/scans/scan-http';
import { discardUnprocessedPhoto, uploadScanImage } from '@/modules/scans/sessions';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The raw image bytes (JPEG, PNG or WebP, at most 4 MB). Checked by content, re-encoded without metadata, stored privately. */
export async function POST(request: Request, { params }: Ctx) {
  if (!isSameOrigin(request)) return apiError(403, 'bad_origin', 'Invalid request origin.');
  const { id } = await params;
  const g = await scanGate(request, { admission: true });
  if ('response' in g) return g.response;
  if (!ID_SHAPE.test(id)) return unavailable();
  const read = await readBoundedBytes(request, BODY_LIMITS.scanImage);
  if (!read.ok) return read.response;
  const out = await uploadScanImage(db, privateStorage(), g.owner, id, read.bytes);
  if (!out.ok) return failureResponse(out);
  // Inference never runs on the request path. With no evaluated model this is always 'unavailable'.
  const queued = await requestScanInference(g.owner, id);
  if (queued.ok)
    return privateJson(
      { scan: { id, status: 'queued', width: out.width, height: out.height, analysis: 'queued', photo: 'stored' } },
      201
    );
  // Nothing will process it, so it is not kept: deleted now, not at the next scheduled sweep (re-audit A06).
  const gone = await discardUnprocessedPhoto(db, privateStorage(), id);
  const analysis = queued.code === 'backlog_full' ? 'busy' : 'unavailable';
  return privateJson(
    {
      scan: {
        id,
        status: 'failed',
        width: out.width,
        height: out.height,
        analysis,
        photo: gone ? 'deleted' : 'deletion_pending',
      },
    },
    201
  );
}
