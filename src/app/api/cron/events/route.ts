import { NextResponse } from 'next/server';
import { drainAll } from '@/lib/event-consumers';

/** Node runtime: the Postgres driver cannot open a socket at the edge. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The safety net behind the event log.
 *
 * The fast path is `after()` at the end of checkout: the customer gets their
 * response, then the same invocation drains the log, so a confirmation email
 * lands within a second or two. This endpoint exists for the times that does
 * not happen — the invocation was killed mid-drain, the email provider was
 * down for the whole batch, a consumer was deployed after the events it needs.
 *
 * Worth knowing before relying on it: Vercel's Hobby plan runs cron jobs once
 * per day and allows two of them. So on the free plan this is a daily backstop
 * against a rare failure, not a scheduler — which is exactly why the fast path
 * had to be the fast path rather than "the queue will get to it".
 *
 * Same bearer-token protection as the sweep. Draining is not destructive, but
 * it does send messages, and an open endpoint that sends messages is a way to
 * make someone else's outbox expensive.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, consumers: await drainAll() });
}
