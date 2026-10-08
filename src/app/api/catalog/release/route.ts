import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/db';
import { compileRelease, type Manifest } from '@/modules/knowledge/compile';
import { loadActiveRelease } from '@/modules/knowledge/releases';
import { productionInput } from '@/modules/knowledge/production-input';

/**
 * The knowledge the browser's routine engine runs on (spec section 20):
 * the active release's manifest and artifacts. Public catalogue and
 * approved knowledge only, nothing personal.
 *
 * Until a release is published, the repository's approved knowledge is
 * compiled here and returned with `published: false`, so the quiz still
 * works as a session-only preview. Saving needs a published release and
 * will say so.
 */
export const dynamic = 'force-dynamic';

export type ReleaseResponse = { published: boolean; manifest: Manifest; artifacts: Record<string, unknown> };

let unpublished: ReleaseResponse | null = null;
function unpublishedRelease(): ReleaseResponse {
  if (unpublished) return unpublished;
  const compiled = compileRelease(productionInput().input, { fixture: false });
  if (!compiled.ok) throw new Error(`Repository knowledge does not compile: ${compiled.errors.join('; ')}`);
  const { manifest, artifacts } = compiled.release;
  unpublished = {
    published: false,
    manifest,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([k, v]) => [k, JSON.parse(v)])),
  };
  return unpublished;
}

export async function GET() {
  const active = isDatabaseConfigured() ? await loadActiveRelease(db).catch(() => null) : null;
  if (active) {
    const body: ReleaseResponse = { published: true, manifest: active.manifest, artifacts: active.artifacts };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300', ETag: `"${active.manifest.releaseId}"` },
    });
  }
  return NextResponse.json(unpublishedRelease(), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
}
