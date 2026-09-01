import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { getOrdersForUser } from '@/lib/orders';
import { formatPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** A customer's order history, scoped to their user id. */
export default async function AccountOrdersPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect('/login?callbackUrl=/account/orders');

  const orders = isDatabaseConfigured() ? await getOrdersForUser(session.user.id) : [];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <nav className="text-[13px] text-muted-foreground">
        <Link href="/account" className="transition-colors hover:text-primary">
          Your Account
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-foreground">Your Orders</span>
      </nav>

      <h1 className="mt-3 flex items-center gap-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        <Package className="h-8 w-8 text-primary" aria-hidden="true" />
        Your Orders
      </h1>

      {orders.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border p-10 text-center">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            You have not placed an order yet.
          </p>
          <Link href="/collections">
            <Button className="mt-6 rounded-md px-8 py-6 text-xs font-semibold uppercase tracking-[0.2em]">
              Start shopping
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <Link
                    href={`/orders/${order.orderNumber}`}
                    className="font-medium transition-colors hover:text-primary"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.createdAt.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">{formatPaise(order.total)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {order.status}
                  </p>
                </div>
              </div>

              <ul className="mt-4 border-t border-border pt-4 text-[15px] leading-relaxed text-muted-foreground">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.productName}
                    <span className="text-muted-foreground/70">
                      {' '}
                      · {item.size} × {item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
