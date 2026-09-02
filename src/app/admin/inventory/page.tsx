import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { isDatabaseConfigured } from '@/db';
import { listInventory, listUntrackedSkus } from '@/lib/admin-data';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setBackorder, setStock } from '../actions';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

/**
 * Stock levels, and the SKUs that have none.
 *
 * The second half matters as much as the first. `reserveStock` treats a
 * missing inventory row as unlimited — the right default for launch, so the
 * shop keeps working before anyone counts a shelf, and a silent hole once
 * stock control is supposed to mean something. Those SKUs are listed
 * separately with a box to start counting them, rather than being invisible.
 */
export default async function AdminInventoryPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const [rows, untracked] = await Promise.all([listInventory(), listUntrackedSkus()]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Inventory</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Counts are absolute: enter what is on the shelf, not the difference.
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
                <th className="p-4 font-semibold">Set count</th>
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
                      <form action={setStock} className="flex items-center gap-2">
                        <input type="hidden" name="productId" value={row.productId} />
                        <input type="hidden" name="size" value={row.size} />
                        <Input
                          name="quantity"
                          type="number"
                          min={0}
                          defaultValue={row.quantity}
                          aria-label={`Stock for ${row.productName} ${row.size}`}
                          className="h-10 w-24 rounded-md"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
                        >
                          Save
                        </Button>
                      </form>
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
            These {untracked.length} SKU{untracked.length === 1 ? '' : 's'} have no inventory row,
            so they sell without limit. Enter a count to bring one under stock control.
          </p>

          <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
            {untracked.map((sku) => (
              <li
                key={`${sku.productId}-${sku.size}`}
                className="flex flex-wrap items-center gap-4 p-4"
              >
                <span className="text-[15px]">
                  {sku.productName}
                  <span className="ml-2 text-muted-foreground">{sku.size}</span>
                </span>
                <form action={setStock} className="ml-auto flex items-center gap-2">
                  <input type="hidden" name="productId" value={sku.productId} />
                  <input type="hidden" name="size" value={sku.size} />
                  <Input
                    name="quantity"
                    type="number"
                    min={0}
                    defaultValue={0}
                    aria-label={`Stock for ${sku.productName} ${sku.size}`}
                    className="h-10 w-24 rounded-md"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  >
                    Track
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
