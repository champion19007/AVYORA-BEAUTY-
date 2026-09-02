import Link from 'next/link';
import { AlertTriangle, Boxes, IndianRupee, Package, Users } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import { getDashboardStats, listOrders } from '@/lib/admin-data';
import { formatPaise } from '@/lib/money';
import { StatusPill } from './status-pill';

export const dynamic = 'force-dynamic';

/**
 * Operations overview.
 *
 * Replaces a dashboard that read the static catalogue and drew charts from a
 * seeded random-number generator — figures that moved when you reloaded and
 * described nothing. Every number here is a query.
 *
 * Deliberately counts rather than graphs. What an operator opens this page to
 * learn is what needs doing now: what is unpaid, what is waiting to ship, what
 * is about to run out. A trend line answers a different question, and one
 * drawn over a handful of early orders would be noise dressed as insight.
 */
export default async function AdminOverview() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment, so there is nothing to show.
      </p>
    );
  }

  const [stats, recent] = await Promise.all([getDashboardStats(), listOrders(8)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Overview</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {stats.ordersToday} order{stats.ordersToday === 1 ? '' : 's'} today
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Paid revenue"
          value={formatPaise(stats.revenuePaid)}
          hint="Excludes unpaid orders"
          icon={<IndianRupee className="h-5 w-5 text-primary" />}
        />
        <Stat
          label="Awaiting payment"
          value={String(stats.awaitingPayment)}
          hint="Placed but not paid"
          icon={<Package className="h-5 w-5 text-primary" />}
          href="/admin/orders"
        />
        <Stat
          label="To fulfil"
          value={String(stats.awaitingFulfilment)}
          hint="Paid, not yet packed"
          icon={<Package className="h-5 w-5 text-primary" />}
          href="/admin/orders"
        />
        <Stat
          label="Customers"
          value={String(stats.customers)}
          hint="Registered accounts"
          icon={<Users className="h-5 w-5 text-primary" />}
        />
      </div>

      {(stats.outOfStock > 0 || stats.lowStock > 0) && (
        <Link
          href="/admin/inventory"
          className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-5 transition-colors hover:border-primary"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-[15px] leading-relaxed">
            <span className="font-medium">
              {stats.outOfStock > 0 && `${stats.outOfStock} out of stock`}
              {stats.outOfStock > 0 && stats.lowStock > 0 && ' · '}
              {stats.lowStock > 0 && `${stats.lowStock} running low`}
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              An out-of-stock SKU cannot be bought. Review inventory.
            </span>
          </span>
        </Link>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-headline text-xl font-normal tracking-tight">Recent orders</h2>
          <Link href="/admin/orders" className="text-[13px] text-primary hover:opacity-70">
            All orders
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.orderNumber}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-muted/40"
                >
                  <span className="font-mono text-[13px]">{order.orderNumber}</span>
                  <span className="text-[15px] text-muted-foreground">{order.email}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <StatusPill kind="payment" value={order.paymentStatus} />
                    <StatusPill kind="fulfilment" value={order.status} />
                    <span className="w-24 text-right tabular-nums">{formatPaise(order.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Boxes className="h-4 w-4" aria-hidden="true" />
        Stock control is opt-in: a SKU with no inventory row sells without limit.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-3 font-headline text-3xl font-normal tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>
    </>
  );

  const className =
    'rounded-xl border border-border bg-card p-5 transition-colors' +
    (href ? ' hover:border-primary/60' : '');

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
