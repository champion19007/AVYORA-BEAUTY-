import type { Metadata } from 'next';
import { BadgeCheck } from 'lucide-react';
import { db, isDatabaseConfigured } from '@/db';
import { Button } from '@/components/ui/button';
import { getProductById } from '@/lib/catalogue';
import { pendingReviews, publishedReviews } from '@/modules/reviews/reviews';
import { moderateReviewAction } from '../actions';

export const metadata: Metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof pendingReviews>>[number];

/** One form per decision: the decision travels in a hidden field, never inferred from which button submitted. */
function Decide({ id, decision, label, primary }: { id: string; decision: string; label: string; primary?: boolean }) {
  return (
    <form action={moderateReviewAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" variant={primary ? 'default' : 'outline'} className="h-9 rounded-md px-4 text-sm">
        {label}
      </Button>
    </form>
  );
}

function ReviewCard({ review, children }: { review: Row; children: React.ReactNode }) {
  return (
    <li className="space-y-2 p-4">
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {getProductById(review.productId)?.name ?? review.productId}
        </span>
        <span>· {review.rating}/5</span>
        <span>· {review.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
        {review.verified && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified buyer
          </span>
        )}
      </p>
      {review.title && <p className="font-medium">{review.title}</p>}
      <p className="whitespace-pre-wrap text-[15px]">{review.body}</p>
      <div className="flex gap-2">{children}</div>
    </li>
  );
}

/**
 * Reviews from signed-in customers. Nothing appears on the shop until it is
 * published here, and a published review can be hidden again at any time.
 */
export default async function ReviewsPage() {
  if (!isDatabaseConfigured()) {
    return <p className="text-[15px] text-muted-foreground">No database is configured on this deployment.</p>;
  }
  const [waiting, live] = await Promise.all([pendingReviews(db).catch(() => []), publishedReviews(db).catch(() => [])]);

  return (
    <div className="space-y-12">
      <section aria-labelledby="waiting-heading">
        <h1 id="waiting-heading" className="font-headline text-3xl font-normal tracking-tight">
          Reviews
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
          {waiting.length === 0 ? 'Nothing waiting.' : `${waiting.length} waiting for you.`} Publish genuine
          experiences; reject anything with personal details, medical claims or abuse. &quot;Verified buyer&quot; means
          their order of that product was delivered.
        </p>
        {waiting.length > 0 && (
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
            {waiting.map((r) => (
              <ReviewCard key={r.id} review={r}>
                <Decide id={r.id} decision="publish" label="Publish" primary />
                <Decide id={r.id} decision="reject" label="Reject" />
              </ReviewCard>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="live-heading">
        <h2 id="live-heading" className="text-xl font-medium tracking-tight">
          On the shop ({live.length})
        </h2>
        {live.length === 0 ? (
          <p className="mt-1 text-[15px] text-muted-foreground">No published reviews yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {live.map((r) => (
              <ReviewCard key={r.id} review={r}>
                <Decide id={r.id} decision="hide" label="Hide" />
              </ReviewCard>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
