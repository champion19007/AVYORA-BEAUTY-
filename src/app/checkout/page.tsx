import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutClient } from './checkout-client';
import { SAMPLE_ORDER_MESSAGE, sampleOrdersBlocked } from '@/lib/catalogue-mode';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { isCashfreeConfigured } from '@/lib/cashfree';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { listAddresses } from '@/lib/addresses';
import { guestPhoneCheckRequired } from '@/lib/checkout-phone';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Avyora order.',
  robots: { index: false, follow: false },
};

// Which payment methods are offered depends on server environment, and the
// saved addresses depend on who is signed in, so this cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  // Sample inventory cannot be ordered in production builds: say so before anyone types an address.
  if (sampleOrdersBlocked()) {
    return (
      <main className="container mx-auto max-w-2xl py-24 text-center">
        <h1 className="text-4xl font-medium tracking-tight">Orders are not open yet</h1>
        <p className="mt-4 text-[15px] text-muted-foreground">{SAMPLE_ORDER_MESSAGE} Your bag is kept on this device.</p>
        <Link href="/collections" className="mt-8 inline-block underline">
          Back to the shop
        </Link>
      </main>
    );
  }
  const session = await auth().catch(() => null);

  // Guests get the blank form; signed-in customers get their address book, so
  // an address saved once never has to be typed again.
  const savedAddresses =
    session?.user?.id && isDatabaseConfigured()
      ? await listAddresses(session.user.id).catch(() => [])
      : [];

  // Both fresh: these are the figures the customer agrees to. Stock is null
  // with no database, where there is nothing to check it against.
  const [prices, stock] = await Promise.all([
    displayPrices({ fresh: true }),
    isDatabaseConfigured() ? catalogueStock({ fresh: true }) : Promise.resolve(null),
  ]);

  return (
    <CheckoutClient
      prices={prices}
      stock={stock}
      onlineEnabled={isCashfreeConfigured()}
      savedAddresses={savedAddresses}
      defaultEmail={session?.user?.email ?? ''}
      phoneCheck={guestPhoneCheckRequired(session?.user?.id)}
    />
  );
}
