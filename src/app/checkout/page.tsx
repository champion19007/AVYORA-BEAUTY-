import type { Metadata } from 'next';
import { CheckoutClient } from './checkout-client';
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

  return (
    <CheckoutClient
      razorpayEnabled={isRazorpayConfigured()}
      savedAddresses={savedAddresses}
      defaultEmail={session?.user?.email ?? ''}
    />
  );
}
