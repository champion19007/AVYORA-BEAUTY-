import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adjustBatchAction, receiveStockAction } from '@/app/manager/actions';
import { MIN_SHELF_LIFE_DAYS } from '@/lib/inventory';
import type { BatchRow } from '@/lib/manager-data';

const REASONS = ['Damaged', 'Count correction', 'Used as tester', 'Other'] as const;
const buttonClass = 'h-9 rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.14em]';

/**
 * One SKU's batches, with the two things the stockroom does to them: record
 * a delivery, and correct a batch's count. Shared by the stockroom and the
 * owner's inventory page; `back` is where the forms return.
 */
export function StockBatches({
  productId,
  productName,
  size,
  batches,
  back,
}: {
  productId: string;
  productName: string;
  size: string;
  batches: BatchRow[];
  back: '/manager/stock' | '/admin/inventory';
}) {
  const hidden = (
    <>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="back" value={back} />
    </>
  );

  return (
    <div className="space-y-3 text-[14px]">
      {batches.length === 0 && <p className="text-muted-foreground">No batches recorded.</p>}
      {batches.map((b) => (
        <div key={b.id} className="space-y-1.5">
          <p>
            <span className="font-medium">{b.batchCode === 'NOT-RECORDED' ? 'Batch not recorded' : b.batchCode}</span>
            <span className="text-muted-foreground">
              {' · '}
              {b.expiresOn ? `exp ${b.expiresOn}` : 'expiry not recorded'} ·{' '}
              <span className="tabular-nums">{b.quantity}</span> on sale
            </span>
            {b.expiredUnits > 0 && (
              <span className="block text-[13px] font-medium text-amber-700 dark:text-amber-400">
                {b.expiredUnits} within {MIN_SHELF_LIFE_DAYS} days of expiry: take off the shelf
              </span>
            )}
          </p>
          {b.quantity > 0 && (
            <form action={adjustBatchAction} className="flex flex-wrap items-center gap-2">
              {hidden}
              <input type="hidden" name="lotId" value={b.id} />
              <Input
                name="delta"
                type="number"
                step={1}
                required
                placeholder="-3 or +2"
                aria-label={`Change batch ${b.batchCode} of ${productName} ${size}`}
                className="h-9 w-24 rounded-md"
              />
              <select
                name="reason"
                aria-label="Reason"
                className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
              >
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" className={buttonClass}>
                Apply
              </Button>
            </form>
          )}
        </div>
      ))}

      <details>
        <summary className="cursor-pointer text-[13px] font-medium text-primary">Receive a delivery</summary>
        <form action={receiveStockAction} className="mt-2 flex flex-wrap items-end gap-2">
          {hidden}
          <input type="hidden" name="size" value={size} />
          <label className="grid gap-1 text-[12px] text-muted-foreground">
            Batch no.
            <Input name="batchCode" required maxLength={40} className="h-9 w-32 rounded-md uppercase" />
          </label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">
            Expiry
            <Input name="expiresOn" type="date" required className="h-9 w-40 rounded-md" />
          </label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">
            Units
            <Input name="quantity" type="number" min={1} required className="h-9 w-20 rounded-md" />
          </label>
          <Button type="submit" variant="outline" className={buttonClass}>
            Receive
          </Button>
        </form>
      </details>
    </div>
  );
}

/** The message a refused stock action sent back, shown above the table. */
export function StockError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
    >
      {error}
    </p>
  );
}
