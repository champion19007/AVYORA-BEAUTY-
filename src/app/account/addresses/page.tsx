import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { listAddresses } from '@/lib/addresses';
import { makeDefaultAddress, removeAddress } from './actions';

export const metadata: Metadata = {
  title: 'Your addresses',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The address book.
 *
 * Laid out as a grid of cards with the "add" tile first, the pattern every
 * Indian shopper already knows from Amazon and Flipkart. The default address
 * is badged and sorts to the front so the one that matters at checkout is the
 * one you see first.
 */
export default async function AddressesPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect('/login?callbackUrl=/account/addresses');

  const addresses = isDatabaseConfigured() ? await listAddresses(session.user.id) : [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-16">
      <nav className="text-[13px] text-muted-foreground">
        <Link href="/account" className="transition-colors hover:text-primary">
          Your Account
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-foreground">Your Addresses</span>
      </nav>

      <h1 className="mt-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        Your Addresses
      </h1>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* The add tile leads, so the primary action is never below the fold. */}
        <Link
          href="/account/addresses/new"
          className="group flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-9 w-9 text-muted-foreground transition-colors group-hover:text-primary" />
          <span className="font-headline text-2xl font-normal tracking-tight">Add address</span>
        </Link>

        {addresses.map((address) => (
          <div
            key={address.id}
            className="flex min-h-[240px] flex-col rounded-xl border border-border bg-card p-6"
          >
            {address.isDefault && (
              <p className="mb-3 border-b border-border pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Default address
              </p>
            )}

            <address className="flex-1 text-[15px] not-italic leading-relaxed text-muted-foreground">
              <span className="block font-medium text-foreground">{address.fullName}</span>
              {address.line1}
              <br />
              {address.line2 && (
                <>
                  {address.line2}
                  <br />
                </>
              )}
              {address.landmark && (
                <>
                  {address.landmark}
                  <br />
                </>
              )}
              {address.city}, {address.state} {address.postalCode}
              <br />
              India
              <br />
              Phone number: {address.phone}
            </address>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4 text-[13px]">
              <Link
                href={`/account/addresses/${address.id}/edit`}
                className="text-primary transition-opacity hover:opacity-70"
              >
                Edit
              </Link>

              <span className="text-border">|</span>

              {/* Plain forms so both actions work without JavaScript. */}
              <form action={removeAddress}>
                <input type="hidden" name="id" value={address.id} />
                <button type="submit" className="text-primary transition-opacity hover:opacity-70">
                  Remove
                </button>
              </form>

              {!address.isDefault && (
                <>
                  <span className="text-border">|</span>
                  <form action={makeDefaultAddress}>
                    <input type="hidden" name="id" value={address.id} />
                    <button
                      type="submit"
                      className="text-primary transition-opacity hover:opacity-70"
                    >
                      Set as Default
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
