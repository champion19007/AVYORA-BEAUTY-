import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Receipt, Truck } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import { getOrderDetail } from '@/lib/admin-data';
import { formatPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { StatusPill } from '../../status-pill';
import { allowedNextStatuses, updateOrderStatus } from '../../actions';

export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

/**
 * Everything about one order: what was bought, where it goes, whether it is
 * paid, and the one action an operator can take on it.
 *
 * The address is shown in full, because packing a parcel needs it. That makes
 * this page personal data, which is why the whole `/admin` tree is behind the
 * operator session and marked `noindex`.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  if (!isDatabaseConfigured()) notFound();

  const order = await getOrderDetail(orderNumber);
  if (!order) notFound();

  const address = order.shippingAddress as Record<string, string> | null;
  const nextStatuses = await allowedNextStatuses(order.status);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/orders" className="text-[13px] text-primary hover:opacity-70">
          ← Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-headline text-3xl font-normal tracking-tight">
            {order.orderNumber}
          </h1>
          <StatusPill kind="payment" value={order.paymentStatus} />
          <StatusPill kind="fulfilment" value={order.status} />
        </div>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Placed{' '}
          {order.createdAt.toLocaleString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* What was bought                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-headline text-xl font-normal tracking-tight">
            <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
            Items
          </h2>

          <ul className="mt-5 divide-y divide-border">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-3">
                <span className="text-[15px]">
                  {item.productName}
                  <span className="block text-[13px] text-muted-foreground">
                    {item.size} · {item.quantity} × {formatPaise(item.unitPrice)}
                  </span>
                </span>
                <span className="tabular-nums">{formatPaise(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-border pt-5 text-[15px]">
            <Row label="Subtotal" value={formatPaise(order.subtotal)} />
            {order.discount > 0 && <Row label="Discount" value={`−${formatPaise(order.discount)}`} />}
            <Row label="Delivery" value={order.shipping === 0 ? 'Free' : formatPaise(order.shipping)} />
            <Row label="GST" value={formatPaise(order.tax)} />
            <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPaise(order.total)}</dd>
            </div>
          </dl>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Where it goes, and what to do next                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-headline text-xl font-normal tracking-tight">
              <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
              Deliver to
            </h2>

            {address ? (
              <address className="mt-4 text-[15px] not-italic leading-relaxed text-muted-foreground">
                <span className="block font-medium text-foreground">{address.fullName}</span>
                {address.line1}
                {address.line2 ? <>, {address.line2}</> : null}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.country ?? 'IN'}
                <br />
                <span className="mt-2 block text-foreground">{address.phone}</span>
              </address>
            ) : (
              <p className="mt-4 text-[15px] text-muted-foreground">No address on this order.</p>
            )}

            <p className="mt-4 border-t border-border pt-4 text-[13px] text-muted-foreground">
              {order.email}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-headline text-xl font-normal tracking-tight">
              <Truck className="h-5 w-5 text-primary" aria-hidden="true" />
              Fulfilment
            </h2>

            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Payment is set by the Razorpay webhook and cannot be changed here — it is the record
              of what actually happened to the money.
            </p>

            {nextStatuses.length === 0 ? (
              <p className="mt-4 text-[15px] text-muted-foreground">
                No further action available for a {order.status} order.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {nextStatuses.map((status) => (
                  <form key={status} action={updateOrderStatus}>
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <input type="hidden" name="status" value={status} />
                    <Button
                      type="submit"
                      variant={status === 'cancelled' ? 'outline' : 'default'}
                      className="rounded-md px-5 py-5 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    >
                      Mark {status}
                    </Button>
                  </form>
                ))}
              </div>
            )}

            {order.paymentReference && (
              <p className="mt-5 break-all border-t border-border pt-4 text-[12px] text-muted-foreground">
                Payment ref: <span className="font-mono">{order.paymentReference}</span>
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
