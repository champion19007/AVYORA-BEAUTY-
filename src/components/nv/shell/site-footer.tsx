import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { FREE_DELIVERY_LINE } from '@/lib/money';
import { IS_SAMPLE_CATALOGUE } from '@/lib/catalogue-mode';
import { ACCOUNT_NAV, LEGAL_NAV, PRIMARY_NAV } from './nav';
import { NewsletterForm } from './newsletter-form';

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
    <footer className="flex min-h-[530px] flex-col justify-between bg-nv-ink font-nv text-white">
      <div className="grid gap-12 px-nv-gutter pb-16 pt-16 lg:grid-cols-[1fr_auto] lg:gap-16 lg:pt-[100px]">
        <div>
          <Link href="/" className="nv-focus-light font-wordmark text-nv-wordmark-lg">
            Avyora
          </Link>
          <p className="mt-8 text-nv-label text-nv-faint">Support</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="nv-focus-light text-nv-intro">
            {SUPPORT_EMAIL}
          </a>
          {process.env.NEXT_PUBLIC_NEWSLETTER === '1' && <NewsletterForm />}
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-16">
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
      <div className="flex flex-col gap-2 border-t border-white/15 sm:flex-row sm:justify-between px-nv-gutter py-6 text-nv-small text-white/80">
        <p>© {new Date().getFullYear()} Avyora</p>
        <p>
          {IS_SAMPLE_CATALOGUE && 'Preview shop: products shown are samples, not real stock. '}
          {FREE_DELIVERY_LINE}. Prices are confirmed at checkout.
        </p>
      </div>
    </footer>
  );
}
