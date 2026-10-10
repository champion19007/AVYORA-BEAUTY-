import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { db, isDatabaseConfigured } from '@/db';
import { confirmSubscription, unsubscribe } from '@/modules/newsletter/newsletter';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Newsletter', robots: { index: false } };

const DONE: Record<string, string> = {
  confirmed: 'You are subscribed. Every email has a link to unsubscribe.',
  unsubscribed: 'You are unsubscribed. No more newsletters will be sent to this address.',
  invalid: 'This link is not valid or has expired. Sign up again from the footer if you want the newsletter.',
};

/*
 * The emailed link only opens this page; the change happens on a button
 * press, so mail scanners that follow links cannot confirm or unsubscribe.
 */
async function act(formData: FormData) {
  'use server';
  const token = String(formData.get('token') ?? '');
  const action = formData.get('action');
  if (!isDatabaseConfigured()) redirect('/newsletter?done=invalid');
  const ok = action === 'confirm' ? await confirmSubscription(db, token) : await unsubscribe(db, token);
  redirect(`/newsletter?done=${ok ? (action === 'confirm' ? 'confirmed' : 'unsubscribed') : 'invalid'}`);
}

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;
  return (
    <main className="container mx-auto max-w-2xl py-20">
      <h1 className="text-4xl font-medium tracking-tight">Newsletter</h1>
      {done ? (
        <p role="status" className="mt-6 text-[15px]">
          {DONE[done] ?? DONE.invalid}
        </p>
      ) : token ? (
        <form action={act} className="mt-8 flex flex-wrap gap-3">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" name="action" value="confirm" className="rounded-full">
            Confirm subscription
          </Button>
          <Button type="submit" name="action" value="unsubscribe" variant="outline" className="rounded-full">
            Unsubscribe
          </Button>
        </form>
      ) : (
        <p className="mt-6 text-[15px]">Open the link from your email to confirm or unsubscribe.</p>
      )}
    </main>
  );
}
