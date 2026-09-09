import type { Metadata } from 'next';
import { TrackForm } from './track-form';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Check where your Avyora order has reached.',
  // The page itself is public, but a result is personal.
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

/**
 * Order tracking.
 *
 * The previous version of this page was a simulation: it read the last digit
 * of whatever was typed and announced a status accordingly, so a customer
 * entering a real order number was told something invented. It has been
 * replaced with a real lookup.
 */
export default function TrackOrderPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-headline text-4xl font-normal tracking-tight md:text-5xl">
        Track your order
      </h1>
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
        Enter your order number and the email you ordered with. Both are on your
        confirmation email.
      </p>

      <div className="mt-10">
        <TrackForm />
      </div>
    </div>
  );
}
