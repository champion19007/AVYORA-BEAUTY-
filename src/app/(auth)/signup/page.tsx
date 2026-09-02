import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerAuth } from '../login/customer-auth';
import { isCustomerAuthConfigured } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { emailDeliveryConfigured, smsDeliveryConfigured } from '@/lib/notify';
import { demoModeEnabled } from '@/lib/demo-access';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** Shares its component with sign-in; only the opening step differs. */
export default function SignupPage() {
  return (
    <Suspense>
      <CustomerAuth
        mode="signup"
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
