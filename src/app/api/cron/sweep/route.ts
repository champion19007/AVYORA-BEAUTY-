import { NextResponse } from 'next/server';
import { sweepAbandonedReservations } from '@/lib/reservation-sweep';
import { pruneExpiredIdempotencyKeys } from '@/infrastructure/idempotency/idempotency';
import { pruneRateLimits } from '@/lib/rate-limit';
import { db } from '@/db';
import { purgeExpiredRoutines } from '@/modules/personal/routines';
import { privateStorage } from '@/modules/scans/private-storage';
import { sweepScans } from '@/modules/scans/sessions';
import { purgeUnconfirmed } from '@/modules/newsletter/newsletter';

/** Node runtime: the Postgres driver cannot open a socket at the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Releases stock held by online orders that were never paid.
 *
 * Called by Vercel Cron (see vercel.json). Protected by CRON_SECRET rather
 * than a staff session, because the caller is a scheduler with no cookie —
 * and left entirely open this would be a way for anyone to cancel pending
 * orders on demand.
 *
 * Vercel sends the secret as a bearer token; a manual run can pass the same
 * value. Without CRON_SECRET configured the endpoint refuses outright rather
 * than running unauthenticated.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Sweep is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const result = await sweepAbandonedReservations();
  const idempotencyKeysPruned = await pruneExpiredIdempotencyKeys().catch(() => 0);
  const rateLimitsPruned = await pruneRateLimits().catch(() => 0);
  const expiredRoutinesDeleted = await purgeExpiredRoutines(db).catch(() => 0);
  const scans = await sweepScans(db, privateStorage()).catch(() => ({
    photosDeleted: 0,
    photoFailures: -1,
    scansDeleted: 0,
  }));

  const unconfirmedSignupsDeleted = await purgeUnconfirmed(db).catch(() => 0);

  return NextResponse.json({
    ok: true,
    ...result,
    idempotencyKeysPruned,
    rateLimitsPruned,
    expiredRoutinesDeleted,
    scans,
    unconfirmedSignupsDeleted,
  });
}
