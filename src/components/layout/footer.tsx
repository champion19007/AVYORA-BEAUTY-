import Link from 'next/link';
import { Facebook, Instagram, Youtube, Mail } from 'lucide-react';
import { Logo } from '@/components/logo';
import { SUPPORT_EMAIL } from '@/data/business-info';

const FOOTER_LINKS = {
  // Every entry points somewhere real. Links previously pointed at "#", which
  // is both a dead end for customers and a blocker for payment-provider
  // activation, since published policies are a condition of going live.
  company: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms & Conditions', href: '/terms' },
    { name: 'Refund & Cancellation', href: '/refund-policy' },
    { name: 'Shipping Policy', href: '/shipping-policy' },
    { name: 'Contact & Grievances', href: '/contact' },
  ],
  quick: [
    { name: 'Shop All', href: '/collections' },
    { name: 'Our Picks', href: '/collections?filter=bestsellers' },
    { name: 'New Arrivals', href: '/collections?filter=new' },
    { name: 'Routine Finder', href: '/routine-finder' },
    { name: 'Journal', href: '/journal' },
    { name: 'Track Order', href: '/track-order' },
  ],
  // The WhatsApp number was a dummy. It returns only when
  // the owner confirms a real one; see the launch check.
  contact: [
    { name: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    { name: 'Contact us', href: '/contact' },
  ],
};

/**
 * Social links. Set a real profile URL to show an icon; leave it null and the
 * icon is not rendered at all. A link to "#" looks live and goes nowhere,
 * which is worse than no icon.
 */
const SOCIALS: { Icon: typeof Instagram; label: string; href: string | null }[] = [
  { Icon: Instagram, label: 'Instagram', href: null },
  { Icon: Facebook, label: 'Facebook', href: null },
  { Icon: Youtube, label: 'YouTube', href: null },
  { Icon: Mail, label: 'Email us', href: `mailto:${SUPPORT_EMAIL}` },
];

function LinkColumn({ heading, links }: { heading: string; links: { name: string; href: string }[] }) {
  return (
    <div>
      <h2 className="mb-6 font-headline text-lg font-medium tracking-wide">{heading}</h2>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.name}>
            <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card pb-10 pt-20 text-card-foreground">
      <div className="container mx-auto grid grid-cols-1 gap-12 border-b border-border px-4 pb-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-6">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Skincare built around a simple routine, delivered to your door.
          </p>
          <div className="flex gap-4">
            {SOCIALS.filter((s) => s.href).map(({ Icon, label, href }) => (
              <Link
                key={label}
                href={href as string}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>

        <LinkColumn heading="Company" links={FOOTER_LINKS.company} />
        <LinkColumn heading="Quick links" links={FOOTER_LINKS.quick} />

        <div>
          <LinkColumn heading="Contact" links={FOOTER_LINKS.contact} />
          {/*
            A newsletter form promising "early access" stood here. It had no
            handler: submitting reloaded the page and the address went
            nowhere. It returns with a real list and consent record.
          */}
        </div>
      </div>

      <div className="container mx-auto mt-8 flex flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} Avyora Skincare. All rights reserved.</p>
        <div className="flex gap-6">
          <Link href="/privacy" className="transition-colors hover:text-primary">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-primary">
            Terms
          </Link>
          <Link href="/refund-policy" className="transition-colors hover:text-primary">
            Refunds
          </Link>
        </div>
      </div>
    </footer>
  );
}
