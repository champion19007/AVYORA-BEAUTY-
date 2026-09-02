import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerAuth } from '../login/customer-auth';
import { isCustomerAuthConfigured } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { emailDeliveryConfigured, smsDeliveryConfigured } from '@/lib/notify';

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
        emailCodesEnabled={isDatabaseConfigured() && emailDeliveryConfigured()}
        smsCodesEnabled={isDatabaseConfigured() && smsDeliveryConfigured()}
      />
    </Suspense>
  );
}
