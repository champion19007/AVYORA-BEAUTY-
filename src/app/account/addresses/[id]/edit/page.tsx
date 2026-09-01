import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getAddress } from '@/lib/addresses';
import { AddressForm } from '../../address-form';

export const metadata: Metadata = {
  title: 'Edit address',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function EditAddressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect(`/login?callbackUrl=/account/addresses/${id}/edit`);

  // Scoped by user id, so another customer's address id 404s rather than opening.
  const address = await getAddress(session.user.id, id);
  if (!address) notFound();

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
        <span className="text-foreground">Edit Address</span>
      </nav>

      <h1 className="mt-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        Edit your address
      </h1>

      <AddressForm address={address} />
    </div>
  );
}
