import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { FREE_DELIVERY_LINE } from '@/lib/money';
import { ACCOUNT_NAV, LEGAL_NAV, PRIMARY_NAV } from './nav';

/**
 * The redesign footer, a server component (rendered by the root layout and
 * passed into the client shell, so it ships no JavaScript). Reference
 * hierarchy: 48 px wordmark and contact on the left, three link columns at a
 * 38 px pitch. The reference sits on a dark photograph; until approved
 * Avyora photography exists this uses the ink colour as the surface.
 */
export function SiteFooter() {
  const columns = [
    { heading: 'Shop', links: PRIMARY_NAV },
    { heading: 'Your account', links: ACCOUNT_NAV },
    { heading: 'Policies', links: LEGAL_NAV },
  ];
  return (
    <footer className="bg-nv-ink font-nv text-white">
      <div className="grid grid-cols-[1fr_auto] gap-16 px-nv-gutter pb-16 pt-[100px]">
        <div>
          <Link href="/" className="nv-focus-light font-wordmark text-nv-wordmark-lg">
            Avyora
          </Link>
          <p className="mt-8 text-nv-label text-nv-faint">Support</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="nv-focus-light text-nv-intro">
            {SUPPORT_EMAIL}
          </a>
        </div>
        <div className="grid grid-cols-3 gap-16">
          {columns.map((c) => (
            <nav key={c.heading} aria-label={c.heading}>
              <h2 className="text-nv-label text-nv-faint">{c.heading}</h2>
              <ul className="mt-4">
                {c.links.map((l) => (
                  <li key={l.href} className="leading-[38px]">
                    <Link href={l.href} className="nv-focus-light text-nv-label hover:text-nv-faint">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="flex justify-between border-t border-white/15 px-nv-gutter py-6 text-nv-small text-white/80">
        <p>© {new Date().getFullYear()} Avyora</p>
        <p>{FREE_DELIVERY_LINE}. Prices are confirmed at checkout.</p>
      </div>
    </footer>
  );
}
