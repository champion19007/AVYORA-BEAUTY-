import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerAuth } from './customer-auth';
import { isCustomerAuthConfigured } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { emailDeliveryConfigured, smsDeliveryConfigured } from '@/lib/notify';
import { demoModeEnabled } from '@/lib/demo-access';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

// Which sign-in methods are offered depends on server environment, so this
// cannot be baked into a static build.
export const dynamic = 'force-dynamic';

/**
 * Each method is gated on what this deployment can actually do. Offering a
 * method whose delivery channel is unconfigured means a customer waits for a
 * code nobody is sending.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <CustomerAuth
        mode="signin"
        googleEnabled={isCustomerAuthConfigured()}
        passwordsEnabled={isDatabaseConfigured()}
        // Offered when a provider can deliver, or when demo identifiers are
        // configured — the code is then shown on screen for those addresses
        // only. See lib/demo-access.ts.
        emailCodesEnabled={isDatabaseConfigured() && (emailDeliveryConfigured() || demoModeEnabled())}
        smsCodesEnabled={isDatabaseConfigured() && (smsDeliveryConfigured() || demoModeEnabled())}
      />
    </Suspense>
  );
}
