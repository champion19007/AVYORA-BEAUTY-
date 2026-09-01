import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerAuth } from '../login/customer-auth';
import { isCustomerAuthConfigured } from '@/auth';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Sign-up shares its component with sign-in: with Google there is no separate
 * registration step, so the only real difference is the wording.
 */
export default function SignupPage() {
  return (
    <Suspense>
      <CustomerAuth googleEnabled={isCustomerAuthConfigured()} mode="signup" />
    </Suspense>
  );
}
