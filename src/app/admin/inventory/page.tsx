import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import Link from 'next/link';
import { listInventory, listOrders, listUntrackedSkus } from '@/lib/admin-data';
import { formatPaise } from '@/lib/money';
import { needsShipping } from '@/lib/order-progress';
import { StatusPill } from '../status-pill';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setBackorder } from '../actions';
import { listBatches, ordersForBatch } from '@/lib/manager-data';
import { StockBatches, StockError } from '@/components/admin/stock-batches';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

/**
 * Stock levels, and the SKUs that have none.
 *
 * The second half matters as much as the first. A SKU with no inventory row
 * cannot be sold at all — `reserveStock` refuses it — so an uncounted product
 * is invisibly unbuyable. Those are listed separately with a box to start
 * counting them, rather than being left to fail quietly at checkout.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; batch?: string }>;
}) {
  const { error, batch } = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  // ponytail: scans the 200 newest orders; move to a status-filtered query if the backlog ever outgrows that.
  const [rows, untracked, recent, batches, batchOrders] = await Promise.all([
    listInventory(),
    listUntrackedSkus(),
    listOrders(200),
    listBatches(),
    batch?.trim() ? ordersForBatch(batch) : Promise.resolve(null),
  ]);
  const toShip = recent.filter(needsShipping).reverse(); // oldest first: ship in the order they came in

  return (
    <div className="space-y-10">
      <StockError error={error} />
      <section aria-labelledby="to-ship">
        <h2 id="to-ship" className="font-headline text-2xl font-normal tracking-tight">
          Orders to ship <span className="text-muted-foreground">({toShip.length})</span>
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Paid or cash-on-delivery orders not yet sent, oldest first. Open one to mark it packed and shipped.
        </p>
        {toShip.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-[15px] text-muted-foreground">
            Nothing waiting to ship.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {toShip.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.orderNumber}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-[15px] hover:bg-muted/50"
                >
                  <span className="font-medium">{o.orderNumber}</span>
                  <span className="text-muted-foreground">
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'} ·{' '}
                    {[o.shippingCity, o.shippingState].filter(Boolean).join(', ') || 'No address'}
                  </span>
                  <span className="tabular-nums">{formatPaise(o.total)}</span>
                  <StatusPill kind="fulfilment" value={o.status} />
                  <span className="ml-auto text-muted-foreground">
                    {o.paymentProvider === 'cod' ? 'Cash on delivery' : 'Paid online'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Inventory</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
          Stock is held by batch. Deliveries and corrections are usually entered by the stockroom; the same forms are
          here for when they are away.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          Nothing is tracked yet. Add counts below to begin.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="p-4 font-semibold">Product</th>
                <th className="p-4 font-semibold">Size</th>
                <th className="p-4 font-semibold">In stock</th>
                <th className="p-4 font-semibold">Batches</th>
                <th className="p-4 font-semibold">Backorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const out = row.quantity <= 0 && !row.allowBackorder;
                const low = row.quantity > 0 && row.quantity <= row.lowStockThreshold;

                return (
                  <tr key={row.id} className="transition-colors hover:bg-muted/40">
                    <td className="p-4">
                      {row.productName}
                      {row.orphaned && (
                        <span className="mt-1 flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Not in the catalogue — sells nothing
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground">{row.size}</td>
                    <td className="p-4">
                      <span
                        className={
                          out
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : low
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : 'tabular-nums'
                        }
                      >
                        {row.quantity}
                        {out && ' · out of stock'}
                        {low && ' · low'}
                      </span>
                    </td>
                    <td className="p-4">
                      <StockBatches
                        productId={row.productId}
                        productName={row.productName}
                        size={row.size}
                        batches={batches.get(`${row.productId}::${row.size}`) ?? []}
                        back="/admin/inventory"
                      />
                    </td>
                    <td className="p-4">
                      <form action={setBackorder}>
                        <input type="hidden" name="productId" value={row.productId} />
                        <input type="hidden" name="size" value={row.size} />
                        <input type="hidden" name="allow" value={String(!row.allowBackorder)} />
                        <button
                          type="submit"
                          className="text-[13px] text-primary hover:opacity-70"
                          title="Selling past zero, for made-to-order or pre-order items"
                        >
                          {row.allowBackorder ? 'On — turn off' : 'Off — turn on'}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {untracked.length > 0 && (
        <section>
          <h2 className="font-headline text-xl font-normal tracking-tight">Not yet counted</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
            These {untracked.length} SKU{untracked.length === 1 ? '' : 's'} have no inventory row, so they cannot be
            sold at all. Receive a delivery to bring one under stock control.
          </p>

          {/* No confirmation here: there is no counted value to overwrite. */}
          <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
            {untracked.map((sku) => (
              <li key={`${sku.productId}-${sku.size}`} className="flex flex-wrap items-center gap-4 p-4">
                <span className="text-[15px]">
                  {sku.productName}
                  <span className="ml-2 text-muted-foreground">{sku.size}</span>
                </span>
                <div className="ml-auto">
                  <StockBatches
                    productId={sku.productId}
                    productName={sku.productName}
                    size={sku.size}
                    batches={[]}
                    back="/admin/inventory"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="batch-lookup">
        <h2 id="batch-lookup" className="font-headline text-xl font-normal tracking-tight">
          Find a batch
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
          For a complaint or a recall: every order that received units of a batch, with how to reach the customer.
        </p>
        <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            name="batch"
            defaultValue={batch ?? ''}
            placeholder="Batch number"
            aria-label="Batch number"
            className="h-10 w-48 rounded-md uppercase"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            Find orders
          </Button>
        </form>
        {batchOrders && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            {batchOrders.length === 0 ? (
              <p className="p-6 text-center text-[15px] text-muted-foreground">No order received batch {batch}.</p>
            ) : (
              <table className="w-full min-w-[760px] text-left text-[14px]">
                <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="p-3 font-semibold">Order</th>
                    <th className="p-3 font-semibold">Customer</th>
                    <th className="p-3 font-semibold">Product</th>
                    <th className="p-3 font-semibold">Units</th>
                    <th className="p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batchOrders.map((o) => (
                    <tr key={`${o.orderNumber}-${o.productName}-${o.size}`}>
                      <td className="p-3">
                        <Link href={`/admin/orders/${o.orderNumber}`} className="font-medium text-primary">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3">
                        {o.customerName}
                        <span className="block text-muted-foreground">
                          {[o.email, o.phone].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td className="p-3">
                        {o.productName} <span className="text-muted-foreground">· {o.size}</span>
                      </td>
                      <td className="p-3 tabular-nums">{o.quantity}</td>
                      <td className="p-3">
                        <StatusPill kind="fulfilment" value={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
