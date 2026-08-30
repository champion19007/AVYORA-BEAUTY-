import type { Metadata } from 'next';
import { CheckoutClient } from './checkout-client';
import { isRazorpayConfigured } from '@/lib/razorpay';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Avyora order.',
  robots: { index: false, follow: false },
};

// Which payment methods are offered depends on server environment, so this
// cannot be baked into a static build.
export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return <CheckoutClient razorpayEnabled={isRazorpayConfigured()} />;
}
