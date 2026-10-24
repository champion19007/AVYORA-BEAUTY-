import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import { listBatches, listManagerStock } from '@/lib/manager-data';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockBatches, StockError } from '@/components/admin/stock-batches';
import { requestRestock } from '../actions';

export const metadata: Metadata = { title: 'Stock' };
export const dynamic = 'force-dynamic';

/**
 * The shelf, batch by batch.
 *
 * Deliveries are recorded with their batch number and expiry; corrections are
 * deltas on one batch — "-3, damaged" — because that is what actually
 * happened at the shelf, and asking the person holding the box to compute a
 * new total is how a miscount gets in.
 *
 * Every catalogue SKU is listed, including ones never counted. From the
 * manager's side "we have never counted this" and "we have none" look
 * identical on the shelf, and both mean a customer cannot buy it.
 */
export default async function ManagerStockPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const [rows, batches] = await Promise.all([listManagerStock(), listBatches()]);
  const out = rows.filter((r) => r.quantity <= 0).length;

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Stock</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Record each delivery with its batch number and expiry. Orders take the earliest expiry first.
        {out > 0 && ` ${out} item${out === 1 ? '' : 's'} at zero.`}
      </p>

      <div className="mt-4">
        <StockError error={error} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[980px] text-left text-[15px]">
          <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="p-4 font-semibold">Product</th>
              <th className="p-4 font-semibold">Size</th>
              <th className="p-4 font-semibold">On shelf</th>
              <th className="p-4 font-semibold">Batches</th>
              <th className="p-4 font-semibold">Need more</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const isOut = row.quantity <= 0;
              const isLow = row.quantity > 0 && row.quantity <= row.lowStockThreshold;

              return (
                <tr key={`${row.productId}-${row.size}`} className="transition-colors hover:bg-muted/40">
                  <td className="p-4">{row.productName}</td>
                  <td className="p-4 text-muted-foreground">{row.size}</td>

                  <td className="p-4">
                    {isOut ? (
                      <span className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Out of stock
                      </span>
                    ) : (
                      <span className={isLow ? 'font-medium text-amber-600 dark:text-amber-400' : 'tabular-nums'}>
                        {row.quantity}
                        {isLow && ' · low'}
                      </span>
                    )}
                  </td>

                  <td className="p-4">
                    <StockBatches
                      productId={row.productId}
                      productName={row.productName}
                      size={row.size}
                      batches={batches.get(`${row.productId}::${row.size}`) ?? []}
                      back="/manager/stock"
                    />
                  </td>

                  <td className="p-4">
                    {row.requested ? (
                      <span className="text-[13px] text-muted-foreground">Already requested</span>
                    ) : (
                      <form action={requestRestock} className="flex items-center gap-2">
                        <input type="hidden" name="productId" value={row.productId} />
                        <input type="hidden" name="size" value={row.size} />
                        <Input
                          name="requestedQuantity"
                          type="number"
                          min={1}
                          defaultValue={24}
                          aria-label={`Request more ${row.productName} ${row.size}`}
                          className="h-10 w-20 rounded-md"
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          className="h-10 rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
                        >
                          Request
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
