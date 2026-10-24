import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { deleteAccountAction, deleteSkinDataAction } from './actions';

export const metadata: Metadata = {
  title: 'Login and data',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * What we hold about the signed-in customer, in plain language.
 *
 * Under India's DPDP Act a person is entitled to know what personal data a
 * business holds on them and how to have it erased. Saying so here, next to
 * the data itself, is more useful than burying it in the privacy policy.
 */
export default async function AccountDataPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { done, error } = await searchParams;
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect('/login?callbackUrl=/account/data');

  const user = session.user;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <nav className="text-[13px] text-muted-foreground">
        <Link href="/account" className="transition-colors hover:text-primary">
          Your Account
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-foreground">Login &amp; Data</span>
      </nav>

      <h1 className="mt-3 flex items-center gap-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
        Login &amp; Data
      </h1>

      <section className="mt-10 rounded-xl border border-border bg-card p-6">
        <h2 className="font-headline text-xl font-normal tracking-tight">How you sign in</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          You sign in with Google. We never see or store your Google password, and there is no separate Avyora password
          to remember or lose.
        </p>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-6">
        <h2 className="font-headline text-xl font-normal tracking-tight">What we store</h2>
        <dl className="mt-4 space-y-3 text-[15px] leading-relaxed">
          <Row label="Name" value={user.name ?? '—'} />
          <Row label="Email" value={user.email ?? '—'} />
          <Row label="Profile picture" value={user.image ? 'From your Google account' : '—'} />
          <Row label="Orders" value="What you bought, for how much, and where it shipped" />
          <Row label="Addresses" value="Only the ones you save" />
          <Row label="Skin data" value="Routine finder answers, saved routines and any skin scans, if you used them" />
        </dl>
      </section>

      <section id="delete" className="mt-5 rounded-xl border border-border bg-card p-6">
        <h2 className="font-headline text-xl font-normal tracking-tight">Deleting your data</h2>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
            {error.slice(0, 300)}
          </p>
        )}
        {done === 'skin' && <p className="mt-3 text-sm text-primary">Your skin data is deleted.</p>}

        <form action={deleteSkinDataAction} className="mt-4 space-y-3 text-[15px]">
          <h3 className="font-medium">Delete my skin data</h3>
          <p className="leading-relaxed text-muted-foreground">
            Removes your routine finder answers, saved routines and any skin scan photos and results, and withdraws your
            consent to process them. Your account and orders stay.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required /> Yes, delete my skin data
          </label>
          <Button
            type="submit"
            variant="outline"
            className="rounded-md px-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Delete skin data
          </Button>
        </form>

        <form action={deleteAccountAction} className="mt-8 space-y-3 border-t border-border pt-6 text-[15px]">
          <h3 className="font-medium">Delete my account</h3>
          <p className="leading-relaxed text-muted-foreground">
            Deletes your account and everything attached to it: skin data, reviews, saved addresses, bag, wishlist,
            newsletter sign-up and support messages. Orders you placed are kept, no longer linked to you, for as long as
            tax law requires us to keep invoices; see the{' '}
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              privacy policy
            </Link>
            . This cannot be undone.
          </p>
          <label className="block space-y-1 text-sm">
            <span>Type DELETE to confirm</span>
            <input
              name="confirm"
              required
              autoComplete="off"
              className="block h-10 w-48 rounded-md border border-input bg-background px-3"
            />
          </label>
          <Button
            type="submit"
            variant="destructive"
            className="rounded-md px-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Delete account
          </Button>
        </form>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex-1">{value}</dd>
    </div>
  );
}
