import type { Metadata } from 'next';
import { isDatabaseConfigured } from '@/db';
import { listRestockRequests } from '@/lib/manager-data';

export const metadata: Metadata = { title: 'Requests' };
export const dynamic = 'force-dynamic';

/**
 * Restock requests the manager has raised.
 *
 * Read-only here. Closing a request is the owner's action, because closing it
 * means the stock was actually bought — the same person asking and marking it
 * done would make the record worthless.
 */
export default async function ManagerRequestsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const requests = await listRestockRequests();

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Restock requests</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        The owner sees these and orders the stock.
      </p>

      {requests.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          Nothing requested yet. Ask for more from the Stock page.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <span className="text-[15px]">
                {request.productName}
                <span className="ml-2 text-muted-foreground">{request.size}</span>
              </span>

              <span className="text-[13px] text-muted-foreground">
                asked for {request.requestedQuantity}, had {request.quantityAtRequest}
              </span>

              <span className="ml-auto flex items-center gap-3">
                <span className="text-[13px] text-muted-foreground">
                  {request.createdAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span
                  className={
                    request.status === 'open'
                      ? 'rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400'
                      : 'rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'
                  }
                >
                  {request.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
