import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { getDefaultAddress } from '@/lib/addresses';

export const dynamic = 'force-dynamic';

/**
 * What the header's "Deliver to" line shows: a first name, a city and a PIN.
 *
 * Fetched by the browser after the page has loaded, rather than rendered into
 * the page on the server. Rendering it on the server meant the root layout
 * read the session cookie, and a layout that reads cookies makes every page
 * beneath it dynamic — so no page on the site could be cached, and each
 * visitor, signed in or not, cost a full server render.
 *
 * Returns only what the line displays, never the address itself, and never
 * cacheable: it is one person's data.
 */
export async function GET() {
  const none = NextResponse.json({ address: null }, { headers: { 'Cache-Control': 'no-store' } });
  if (!isDatabaseConfigured()) return none;

  const session = await auth().catch(() => null);
  if (!session?.user?.id) return none;

  const address = await getDefaultAddress(session.user.id).catch(() => null);
  if (!address) return none;

  return NextResponse.json(
    {
      address: {
        firstName: address.fullName.trim().split(/\s+/)[0],
        city: address.city,
        postalCode: address.postalCode,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
