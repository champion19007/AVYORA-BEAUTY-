import type { Metadata } from 'next';
import { isDatabaseConfigured } from '@/db';
import { listRestockRequests } from '@/lib/manager-data';
import { Button } from '@/components/ui/button';
import { resolveRestockRequest } from '../actions';

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

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Restock requests</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {open.length === 0
          ? 'Nothing outstanding.'
          : `${open.length} waiting on you.`}
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
                  {request.requestedBy} asked for {request.requestedQuantity} when{' '}
                  {request.quantityAtRequest} were left ·{' '}
                  {request.createdAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                {request.note && (
                  <p className="mt-1 text-[13px] italic text-muted-foreground">
                    “{request.note}”
                  </p>
                )}
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
