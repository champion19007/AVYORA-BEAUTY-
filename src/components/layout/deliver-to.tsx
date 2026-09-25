'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

type Line = { firstName: string; city: string; postalCode: string };

/**
 * The "Deliver to <name>, <city> <PIN>" indicator in the header.
 *
 * Loaded in the browser, after the page. It used to be a server component in
 * the root layout, which read the session cookie and so made every page on
 * the site dynamic: nothing could be cached, and the storefront topped out
 * at about fifty pages a second under load. Now pages are cached for
 * everyone and this one line is fetched for the person looking at it.
 *
 * Refetched after visiting the account pages, where the address can change.
 * Renders nothing when signed out or when no address is saved — a
 * "Deliver to —" placeholder would take up room while telling the visitor
 * nothing.
 */
export function DeliverTo() {
  const [line, setLine] = useState<Line | null>(null);
  const pathname = usePathname();
  const wasOnAccount = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    const onAccount = pathname?.startsWith('/account') ?? false;
    const leftAccount = wasOnAccount.current && !onAccount;
    wasOnAccount.current = onAccount;
    if (loaded.current && !leftAccount) return;
    loaded.current = true;

    // No cancellation on cleanup: in development React runs this effect
    // twice, and cancelling the first fetch while the flag above skips the
    // second would leave the line blank.
    fetch('/api/account/deliver-to', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { address?: Line | null } | null) => setLine(body?.address ?? null))
      .catch(() => {});
  }, [pathname]);

  if (!line) return null;

  return (
    <Link
      href="/account/addresses"
      className="hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 lg:flex"
    >
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Deliver to {line.firstName}
        </span>
        <span className="block text-[13px] font-medium">
          {line.city} {line.postalCode}
        </span>
      </span>
    </Link>
  );
}
