import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db';
import { getShiprocketConfig, parseTrackingUpdate } from '@/modules/shipping/shiprocket';
import { applyTrackingUpdate } from '@/modules/shipping/shipments';
import { BODY_LIMITS, readBoundedText } from '@/lib/request-body';
import { reportError } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time, length-independent comparison (both sides hashed first). */
function sameToken(given: string, expected: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Courier tracking updates from Shiprocket (Settings → API → Webhooks).
 *
 * The URL avoids "shiprocket", "sr" and "kr", which Shiprocket refuses.
 * Authenticated by the security token Shiprocket sends as `x-api-key`; with no
 * token configured the endpoint refuses everything, because an open one would
 * let anyone mark a parcel delivered.
 *
 * Shiprocket expects 200 for every delivery it makes, so a failure while
 * applying is reported and answered 200: the next update for the same parcel
 * carries the newer status anyway.
 */
export async function POST(request: Request) {
  const config = getShiprocketConfig();
  if (!config?.webhookToken || !isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Courier tracking is not configured.' }, { status: 503 });
  }
  if (!sameToken(request.headers.get('x-api-key') ?? '', config.webhookToken)) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  const read = await readBoundedText(request, BODY_LIMITS.courierWebhook);
  if (!read.ok) return read.response;
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid json' });
  }
  const update = parseTrackingUpdate(body);
  if (!update) return NextResponse.json({ ok: true, ignored: 'not a tracking update' });

  try {
    return NextResponse.json({ ok: true, result: await applyTrackingUpdate(update) });
  } catch (err) {
    reportError(err, { scope: 'webhook.courier', correlationId: update.awb });
    return NextResponse.json({ ok: false });
  }
}
