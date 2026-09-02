import { isDatabaseConfigured } from '@/db';
import { listDispatchQueue } from '@/lib/manager-data';
import { orderProgress } from '@/lib/order-progress';
import { Button } from '@/components/ui/button';
import { advanceDispatch, dispatchActionLabel, nextDispatchSteps } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The dispatch queue.
 *
 * Oldest first, because the person who has waited longest should be served
 * first, and a queue worked newest-first does exactly the opposite.
 *
 * Each card carries everything needed to pack the parcel — what is in it, who
 * it goes to, where, and a phone number for the courier — so the manager never
 * has to open a second screen mid-pack. The customer-facing step is shown
 * beside the button so it is obvious what pressing it will tell them.
 */
export default async function DispatchPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const queue = await listDispatchQueue();

  /*
   * Steps and button wording are resolved here, not inside the map.
   *
   * `nextDispatchSteps` and `dispatchActionLabel` live in a 'use server' file,
   * so they are async by necessity; mapping to async components to await them
   * mid-render is not something React will do. Resolving up front also means
   * one pass over the queue rather than a promise per card.
   */
  const cards = await Promise.all(
    queue.map(async (order) => {
      const steps = await nextDispatchSteps(order.status);
      const actions = await Promise.all(
        steps.map(async (status) => ({ status, label: await dispatchActionLabel(status) }))
      );
      return { order, actions, progress: orderProgress(order.status) };
    })
  );

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Dispatch</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {queue.length === 0
          ? 'Nothing waiting.'
          : `${queue.length} order${queue.length === 1 ? '' : 's'} to work, oldest first.`}
      </p>

      {queue.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          The queue is clear.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {cards.map(({ order, actions, progress }) => {
            const unpaid = order.paymentStatus !== 'paid';

            return (
              <li key={order.id} className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <span className="font-mono text-[13px]">{order.orderNumber}</span>
                    <span className="ml-3 text-[13px] text-muted-foreground">
                      {order.createdAt.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                    Customer sees: {progress.label}
                  </span>
                </div>

                {/*
                  Cash on delivery is unpaid and perfectly fine to send; an
                  online order that never paid is not. Saying which is which
                  here stops the manager either holding a valid parcel or
                  shipping one that was abandoned at the payment step.
                */}
                {unpaid && (
                  <p
                    className={
                      order.paymentProvider === 'cod'
                        ? 'mt-3 text-[13px] text-muted-foreground'
                        : 'mt-3 text-[13px] font-medium text-red-600 dark:text-red-400'
                    }
                  >
                    {order.paymentProvider === 'cod'
                      ? 'Cash on delivery — collect payment at the door.'
                      : 'Not paid. Do not send; check with the owner.'}
                  </p>
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Pack
                    </h2>
                    <ul className="mt-2 text-[15px] leading-relaxed">
                      {order.items.map((item, i) => (
                        <li key={i}>
                          <span className="font-medium tabular-nums">{item.quantity} ×</span>{' '}
                          {item.name}
                          <span className="text-muted-foreground"> · {item.size}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Send to
                    </h2>
                    <p className="mt-2 text-[15px] leading-relaxed">
                      {order.customerName}
                      <span className="block text-muted-foreground">
                        {order.city}
                        {order.state ? `, ${order.state}` : ''} {order.postalCode}
                      </span>
                      {order.phone && (
                        <span className="block text-muted-foreground">{order.phone}</span>
                      )}
                    </p>
                  </div>
                </div>

                {actions.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                    {actions.map(({ status, label }) => (
                      <form key={status} action={advanceDispatch}>
                        <input type="hidden" name="orderNumber" value={order.orderNumber} />
                        <input type="hidden" name="status" value={status} />
                        <Button
                          type="submit"
                          className="rounded-md px-5 py-5 text-[11px] font-semibold uppercase tracking-[0.16em]"
                        >
                          {label}
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
