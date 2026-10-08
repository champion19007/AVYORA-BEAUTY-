import type { Metadata } from 'next';
import { CheckoutClient } from './checkout-client';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { listAddresses } from '@/lib/addresses';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Avyora order.',
  robots: { index: false, follow: false },
};

// Which payment methods are offered depends on server environment, and the
// saved addresses depend on who is signed in, so this cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
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
      razorpayEnabled={isRazorpayConfigured()}
      savedAddresses={savedAddresses}
      defaultEmail={session?.user?.email ?? ''}
    />
  );
}
