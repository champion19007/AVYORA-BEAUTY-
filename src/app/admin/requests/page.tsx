import type { Metadata } from 'next';
import { isDatabaseConfigured } from '@/db';
import { listRestockRequests } from '@/lib/manager-data';
import { Button } from '@/components/ui/button';
import { answerSupportRequest, moderateReviewAction, resolveRestockRequest } from '../actions';
import { pendingReviews } from '@/modules/reviews/reviews';
import { getProductById } from '@/lib/catalogue';
import { db } from '@/db';
import { listSupportRequests } from '@/modules/support/support';

export const metadata: Metadata = { title: 'Restock requests' };
export const dynamic = 'force-dynamic';

/**
 * What the stockroom has asked for.
 *
 * The count at the time of asking is shown next to the request, because by the
 * time it is read the shelf has moved. "They asked when there were three left"
 * is the part that makes the request judgeable.
 *
 * Only the owner can close one, since closing means the stock was actually
 * bought.
 */
export default async function AdminRequestsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const requests = await listRestockRequests();
  const open = requests.filter((r) => r.status === 'open');
  const support = await listSupportRequests(db).catch(() => []);
  const openSupport = support.filter((r) => r.status === 'open');
  const reviews = await pendingReviews(db).catch(() => []);

  return (
    <div>
      <section aria-labelledby="reviews-heading" className="mb-12">
        <h2 id="reviews-heading" className="text-2xl font-medium tracking-tight">
          Reviews to moderate
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {reviews.length === 0 ? 'Nothing waiting.' : `${reviews.length} waiting.`} All are from delivered orders.
          Publish genuine experiences; reject personal details, medical claims or abuse.
        </p>
        {reviews.length > 0 && (
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-2 p-4">
                <p className="text-[13px] text-muted-foreground">
                  {getProductById(r.productId)?.name ?? r.productId} · {r.rating}/5 ·{' '}
                  {r.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </p>
                {r.title && <p className="font-medium">{r.title}</p>}
                <p className="whitespace-pre-wrap text-[15px]">{r.body}</p>
                {/* One form per decision: the decision travels in a hidden field, never inferred from which button submitted. */}
                <div className="flex gap-2">
                  <form action={moderateReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="publish" />
                    <Button type="submit" className="h-9 rounded-md px-4 text-sm">
                      Publish
                    </Button>
                  </form>
                  <form action={moderateReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" variant="outline" className="h-9 rounded-md px-4 text-sm">
                      Reject
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="support-heading" className="mb-12">
        <h1 id="support-heading" className="text-3xl font-medium tracking-tight">
          Customer messages
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {openSupport.length === 0 ? 'Nothing waiting.' : `${openSupport.length} waiting for a reply.`} Reply by email
          from the support mailbox, then mark it answered.
        </p>
        {support.length > 0 && (
          <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
            {support.map((r) => (
              <li key={r.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-[15px]">
                    {r.name} <span className="text-muted-foreground">· {r.email}</span>
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {r.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ref{' '}
                    {r.id.slice(0, 8).toUpperCase()} · {r.status}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-[15px]">{r.message}</p>
                {r.status === 'open' ? (
                  <form action={answerSupportRequest} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="sr-only" htmlFor={`resolution-${r.id}`}>
                      How it was answered
                    </label>
                    <input
                      id={`resolution-${r.id}`}
                      name="resolution"
                      maxLength={500}
                      placeholder="How it was answered (optional)"
                      className="h-10 min-w-[280px] flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    />
                    <Button type="submit" className="h-10 rounded-md px-4 text-sm">
                      Mark answered
                    </Button>
                  </form>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Answered by {r.resolvedBy}
                    {r.resolution ? `: ${r.resolution}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="text-3xl font-medium tracking-tight">Restock requests</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {open.length === 0 ? 'Nothing outstanding.' : `${open.length} waiting on you.`}
      </p>

      {requests.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          The stockroom has not requested anything yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-[220px] flex-1">
                <p className="text-[15px]">
                  {request.productName}
                  <span className="ml-2 text-muted-foreground">{request.size}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {request.requestedBy} asked for {request.requestedQuantity} when {request.quantityAtRequest} were left
                  ·{' '}
                  {request.createdAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                {request.note && <p className="mt-1 text-[13px] italic text-muted-foreground">“{request.note}”</p>}
              </div>

              {request.status === 'open' ? (
                <div className="flex gap-2">
                  <form action={resolveRestockRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="outcome" value="ordered" />
                    <Button
                      type="submit"
                      className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
                    >
                      Ordered
                    </Button>
                  </form>
                  <form action={resolveRestockRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="outcome" value="declined" />
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
                    >
                      Decline
                    </Button>
                  </form>
                </div>
              ) : (
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {request.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
