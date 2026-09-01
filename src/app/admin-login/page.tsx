import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = {
  title: 'Operator sign in',
  // Never index the operator entrance.
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
