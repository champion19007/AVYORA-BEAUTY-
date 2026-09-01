import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerAuth } from './customer-auth';
import { isCustomerAuthConfigured } from '@/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

// Whether Google sign-in is offered depends on server environment, so this
// cannot be baked into a static build.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense>
      <CustomerAuth googleEnabled={isCustomerAuthConfigured()} mode="signin" />
    </Suspense>
  );
}
