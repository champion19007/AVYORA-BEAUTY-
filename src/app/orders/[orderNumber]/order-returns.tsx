import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import {
  CUSTOMER_KINDS,
  KIND_LABEL,
  RETURN_WINDOW_DAYS,
  isCancellable,
  openReturnWindow,
  returnsForOrder,
  type ReturnKind,
} from '@/modules/returns/returns';
import { cancelOrderAction, requestReturnAction } from './actions';

type Order = NonNullable<Awaited<ReturnType<typeof import('@/lib/orders').getOrderByNumber>>>;

const STATUS_TEXT: Record<string, string> = {
  requested: 'We have your request and will reply within two working days.',
  approved: 'Approved. We will be in touch about sending it back.',
  received: 'Back with us. The refund is on its way.',
  rejected: 'We could not accept this return.',
  refunded: 'Refunded.',
};

const buttonClass = 'rounded-md px-6 py-5 text-xs font-semibold uppercase tracking-[0.2em]';
const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** Cancel before packing, or return after delivery, and where any request stands. */
export async function OrderReturns({
  order,
  token,
  done,
  error,
}: {
  order: Order;
  token?: string;
  done?: boolean;
  error?: string;
}) {
  const requests = await returnsForOrder(order.id);
  const open = requests.find((r) => ['requested', 'approved', 'received'].includes(r.status));
  const windowEnds = openReturnWindow(order);
  const canReturn = !open && windowEnds !== null;
  const cancellable = isCancellable(order);
  if (requests.length === 0 && !canReturn && !cancellable && !error) return null;

  const hidden = (
    <>
      <input type="hidden" name="orderNumber" value={order.orderNumber} />
      {token && <input type="hidden" name="t" value={token} />}
    </>
  );

  return (
    <section id="returns" className="mt-6 rounded-xl border border-border p-6">
      <h2 className="font-headline text-xl font-normal tracking-tight">Cancel or return</h2>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {done && !error && <p className="mt-3 text-sm text-primary">Done.</p>}

      {requests.map((r) => (
        <div key={r.id} className="mt-4 text-sm">
          <p className="font-medium">{KIND_LABEL[r.kind as ReturnKind]}</p>
          <p className="text-muted-foreground">
            {r.kind === 'cancelled' && r.status === 'received'
              ? 'Cancelled. Your refund is being processed.'
              : STATUS_TEXT[r.status]}
            {r.status === 'refunded' && r.refundAmount ? ` ${formatPaise(r.refundAmount)}.` : ''}
            {r.status === 'rejected' && r.staffNote ? ` ${r.staffNote}` : ''}
          </p>
        </div>
      ))}

      {cancellable && (
        <form action={cancelOrderAction} className="mt-4 space-y-3 text-sm">
          {hidden}
          <p className="text-muted-foreground">
            Not packed yet, so you can still cancel.
            {order.paymentStatus === 'paid' && order.paymentProvider !== 'cod'
              ? ' We refund the full amount to your original payment method.'
              : ''}
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirm" value="yes" required /> Yes, cancel this order
          </label>
          <Button type="submit" variant="outline" className={buttonClass}>
            Cancel order
          </Button>
        </form>
      )}

      {canReturn && windowEnds && (
        <form action={requestReturnAction} className="mt-4 space-y-4 text-sm">
          {hidden}
          <p className="text-muted-foreground">
            Returns are open until {windowEnds.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} (
            {RETURN_WINDOW_DAYS} days after delivery). For hygiene, change-of-mind returns must be unopened with the
            seal intact; damaged or wrong items can be returned opened.
          </p>
          <fieldset className="space-y-2">
            <legend className="font-medium">Why are you returning it?</legend>
            {CUSTOMER_KINDS.map((kind, i) => (
              <label key={kind} className="flex items-center gap-2">
                <input type="radio" name="kind" value={kind} required defaultChecked={i === 0} /> {KIND_LABEL[kind]}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="font-medium">What are you sending back?</legend>
            {order.items.map((item) => (
              <label key={item.id} className="flex items-center justify-between gap-4">
                <span>
                  {item.productName} <span className="text-muted-foreground">· {item.size}</span>
                </span>
                <input
                  type="number"
                  name={`qty-${item.id}`}
                  min={0}
                  max={item.quantity}
                  defaultValue={order.items.length === 1 ? item.quantity : 0}
                  aria-label={`How many ${item.productName} to return`}
                  className="h-9 w-20 rounded-md border border-input bg-background px-2"
                />
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1">
            <span className="font-medium">Anything we should know?</span>
            <textarea
              name="note"
              rows={3}
              maxLength={1000}
              className={field}
              placeholder="What happened, in a line or two"
            />
          </label>
          {order.paymentProvider === 'cod' && (
            <label className="block space-y-1">
              <span className="font-medium">UPI ID for your refund</span>
              <input name="refundTo" required placeholder="name@okbank" className={field} autoComplete="off" />
              <span className="block text-xs text-muted-foreground">
                You paid in cash, so we refund by UPI. We delete this once the refund is made.
              </span>
            </label>
          )}
          <Button type="submit" variant="outline" className={buttonClass}>
            Request return
          </Button>
        </form>
      )}
    </section>
  );
}
