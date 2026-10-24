import { db, isDatabaseConfigured } from '@/db';
import { reportError } from '@/lib/observability';
import { activePromotions } from '@/modules/offers/store';

/**
 * The automatic offers running now, for the shop's badges and bag hints.
 *
 * Public, the same for everyone, and cached at the edge for a minute, so a
 * new offer shows within about a minute and the database is not asked per
 * visitor. Terms only: checkout decides what is actually taken off.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };
  if (!isDatabaseConfigured()) return Response.json({ promotions: [] }, { headers });
  try {
    return Response.json({ promotions: await activePromotions(db) }, { headers });
  } catch (err) {
    // Badges are a nicety: an outage shows none rather than an error.
    reportError(err, { scope: 'offers.active' });
    return Response.json({ promotions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
