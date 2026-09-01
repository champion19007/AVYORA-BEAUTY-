import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MapPin, Package, ShieldCheck, Sparkles, LifeBuoy, LogIn } from 'lucide-react';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { listAddresses } from '@/lib/addresses';
import { getOrdersForUser } from '@/lib/orders';
import { formatPaise } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Your account',
  // Personal data: never index, never follow.
  robots: { index: false, follow: false },
};

/** Per-customer, so never cached or statically rendered. */
export const dynamic = 'force-dynamic';

/**
 * The account dashboard.
 *
 * A grid of destinations rather than one long page, which is what shoppers
 * expect from a storefront account area: each card is a place to go, with a
 * line of live data under it so the page says something before you click.
 *
 * Sign-in was storing profile, orders and addresses but nothing read any of it
 * back — the account menu's "Your orders" pointed at the generic tracking form
 * and asked for an order number we already had. This is the read side.
 *
 * It also serves a second purpose: under India's DPDP Act a person may see the
 * personal data a business holds about them, and this is that view.
 */
export default async function AccountPage() {
  const session = await auth().catch(() => null);

  // Signing in returns here, so the visitor lands where they were going.
  if (!session?.user?.id) redirect('/login?callbackUrl=/account');

  // Held separately from `user` because `Session['user']['id']` is optional in
  // the Auth.js types; the guard above narrows it, the destructure would not.
  const userId = session.user.id;
  const user = session.user;

  const [orders, addresses] = isDatabaseConfigured()
    ? await Promise.all([getOrdersForUser(userId), listAddresses(userId)])
    : [[], []];

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-16">
      <header className="flex items-center gap-5">
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element -- Google avatar host, not in the image config
          <img
            src={user.image}
            alt=""
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        )}
        <div>
          <h1 className="font-headline text-4xl font-normal tracking-tight md:text-5xl">
            Your Account
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {user.name ? `${user.name} · ` : ''}
            {user.email}
          </p>
        </div>
      </header>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          href="/account/orders"
          icon={<Package className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Your Orders"
          description={
            orders.length === 0
              ? 'Track, return, or buy things again'
              : `${orders.length} order${orders.length === 1 ? '' : 's'} · last ${formatPaise(orders[0]!.total)}`
          }
        />

        <Tile
          href="/account/addresses"
          icon={<MapPin className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Your Addresses"
          description={
            defaultAddress
              ? `${defaultAddress.city}, ${defaultAddress.state} ${defaultAddress.postalCode}`
              : 'Edit addresses for orders and gifts'
          }
        />

        <Tile
          href="/routine-finder"
          icon={<Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Your Routine"
          description="Build a regimen matched to your skin"
        />

        <Tile
          href="/track-order"
          icon={<LifeBuoy className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Track an Order"
          description="Follow a delivery with its order number"
        />

        <Tile
          href="/account/data"
          icon={<ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Login & Data"
          description="What we store and how sign-in works"
        />

        <Tile
          href="/contact"
          icon={<LogIn className="h-7 w-7 text-primary" aria-hidden="true" />}
          title="Contact Us"
          description="Reach customer care"
        />
      </div>
    </div>
  );
}

/** One dashboard destination. */
function Tile({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/60 hover:bg-primary/5"
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <h2 className="font-headline text-xl font-normal tracking-tight">{title}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
