import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/db';
import { privateStorage } from '@/modules/scans/private-storage';
import { scanHealth, sweepScans } from '@/modules/scans/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Photo retention only, for a frequent schedule (re-audit A06).
 *
 * The daily `/api/cron/sweep` alone cannot hold a 24-hour promise: a photo
 * expiring just after it runs would wait almost another day. Today photos
 * are deleted in the upload request itself (no analysis runs), so this is
 * the backstop for failed deletes and, once inference exists, for scans a
 * worker never finished. Before enabling hosted analysis, call this at
 * least hourly: Vercel Cron on a plan that allows it, or any external
 * scheduler with CRON_SECRET. The response reports how late anything is.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: 'No database.' }, { status: 503 });
  const swept = await sweepScans(db, privateStorage());
  const health = await scanHealth(db);
  return NextResponse.json({ ok: true, ...swept, ...health }, { headers: { 'Cache-Control': 'no-store' } });
}
