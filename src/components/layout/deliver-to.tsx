import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { getDefaultAddress } from '@/lib/addresses';

/**
 * The "Deliver to <name>, <city> <PIN>" indicator in the header.
 *
 * A server component, because the default address lives in Postgres and the
 * header is otherwise a client component — rendering this on the server keeps
 * the address out of the client bundle and off the wire until it is needed.
 * The header receives it as a child rather than importing it, so the client
 * boundary stays where it is.
 *
 * Renders nothing at all when signed out or when no address is saved. A
 * "Deliver to —" placeholder would take up the same room while telling the
 * visitor nothing.
 */
export async function DeliverTo() {
  if (!isDatabaseConfigured()) return null;

  const session = await auth().catch(() => null);
  if (!session?.user?.id) return null;

  const address = await getDefaultAddress(session.user.id).catch(() => null);
  if (!address) return null;

  // First name only: the header has room for a reminder, not a full identity.
  const firstName = address.fullName.trim().split(/\s+/)[0];

  return (
    <Link
      href="/account/addresses"
      className="hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 lg:flex"
    >
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Deliver to {firstName}
        </span>
        <span className="block text-[13px] font-medium">
          {address.city} {address.postalCode}
        </span>
      </span>
    </Link>
  );
}
