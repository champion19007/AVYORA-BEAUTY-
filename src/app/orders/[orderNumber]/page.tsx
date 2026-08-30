import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDatabaseConfigured } from '@/db';
import { getOrderByNumber } from '@/lib/orders';
import { formatPaise } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
};

/** Order confirmations are per-customer, so never cache them. */
export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!isDatabaseConfigured()) notFound();

  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  const address = order.shippingAddress as Record<string, string> | null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-6 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl">
          Thank you
        </h1>
        <p className="mt-4 text-muted-foreground">
          Your order <span className="font-medium text-foreground">{order.orderNumber}</span> is
          confirmed. We have sent the details to {order.email}.
        </p>
      </div>

      <div className="mt-12 rounded-xl border border-border bg-card p-6">
        <h2 className="font-headline text-xl font-normal tracking-[0.02em]">Order summary</h2>
        <ul className="mt-5 divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
              <span>
                {item.productName}
                <span className="text-muted-foreground"> · {item.size} × {item.quantity}</span>
              </span>
              <span className="tabular-nums">{formatPaise(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="tabular-nums">
              {order.shipping === 0 ? 'Free' : formatPaise(order.shipping)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(order.total)}</dd>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Includes {formatPaise(order.tax)} GST · Payment: cash on delivery
          </p>
        </dl>
      </div>

      {address && (
        <div className="mt-6 rounded-xl border border-border p-6">
          <h2 className="font-headline text-xl font-normal tracking-[0.02em]">Delivering to</h2>
          <address className="mt-3 text-sm not-italic leading-relaxed text-muted-foreground">
            {address.fullName}
            <br />
            {address.line1}
            {address.line2 ? <>, {address.line2}</> : null}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            {address.phone}
          </address>
        </div>
      )}

      <div className="mt-10 flex justify-center gap-4">
        <Link href="/collections">
          <Button
            variant="outline"
            className="rounded-md px-8 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Continue shopping
          </Button>
        </Link>
      </div>
    </div>
  );
}
