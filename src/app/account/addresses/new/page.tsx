import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AddressForm } from '../address-form';

export const metadata: Metadata = {
  title: 'Add a new address',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewAddressPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect('/login?callbackUrl=/account/addresses/new');

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <nav className="text-[13px] text-muted-foreground">
        <Link href="/account" className="transition-colors hover:text-primary">
          Your Account
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <Link href="/account/addresses" className="transition-colors hover:text-primary">
          Your Addresses
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-foreground">New Address</span>
      </nav>

      <h1 className="mt-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        Add a new address
      </h1>

      <AddressForm />
    </div>
  );
}
