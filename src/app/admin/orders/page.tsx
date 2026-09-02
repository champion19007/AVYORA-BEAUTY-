import type { Metadata } from 'next';
import Link from 'next/link';
import { isDatabaseConfigured } from '@/db';
import { listOrders } from '@/lib/admin-data';
import { formatPaise } from '@/lib/money';
import { StatusPill } from '../status-pill';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

/** How many orders one page shows. */
const PAGE_SIZE = 50;

/**
 * The order book.
 *
 * Paged rather than "all orders", because this is the one screen that grows
 * without bound — fine on day one, a timeout on day four hundred. Newest
 * first, since an operator works the top of the list.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const pageNumber = Math.max(1, Number(page) || 1);
  const offset = (pageNumber - 1) * PAGE_SIZE;

  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  // One extra row tells us whether a next page exists without a count query.
  const rows = await listOrders(PAGE_SIZE + 1, offset);
  const hasNext = rows.length > PAGE_SIZE;
  const orders = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Orders</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Payment and fulfilment are tracked separately — a cash-on-delivery order ships unpaid.
      </p>

      {orders.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          {pageNumber > 1 ? 'No orders on this page.' : 'No orders yet.'}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-left text-[15px]">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="p-4 font-semibold">Order</th>
                <th className="p-4 font-semibold">Placed</th>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Ship to</th>
                <th className="p-4 font-semibold">Items</th>
                <th className="p-4 font-semibold">Payment</th>
                <th className="p-4 font-semibold">Fulfilment</th>
                <th className="p-4 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-muted/40">
                  <td className="p-4">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="font-mono text-[13px] text-primary hover:opacity-70"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="p-4 text-[13px] text-muted-foreground">
                    {order.createdAt.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="p-4">{order.email}</td>
                  <td className="p-4 text-muted-foreground">
                    {order.shippingCity ? `${order.shippingCity}, ${order.shippingState}` : '—'}
                  </td>
                  <td className="p-4 tabular-nums">{order.itemCount}</td>
                  <td className="p-4">
                    <StatusPill kind="payment" value={order.paymentStatus} />
                    {order.paymentProvider === 'cod' && (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        cash on delivery
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <StatusPill kind="fulfilment" value={order.status} />
                  </td>
                  <td className="p-4 text-right tabular-nums">{formatPaise(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(pageNumber > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between text-[13px]">
          {pageNumber > 1 ? (
            <Link href={`/admin/orders?page=${pageNumber - 1}`} className="text-primary hover:opacity-70">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">Page {pageNumber}</span>
          {hasNext ? (
            <Link href={`/admin/orders?page=${pageNumber + 1}`} className="text-primary hover:opacity-70">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
