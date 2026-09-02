'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { savePrice, type PriceFormState } from '../actions';

/**
 * One editable price row.
 *
 * Amounts are entered in rupees because that is what a person says out loud;
 * the action converts to paise, which is the only unit the rest of the system
 * uses. Doing that conversion in one place — server-side — means a decimal
 * typed here cannot become a float anywhere near an order total.
 */
export function PriceRow({
  productId,
  size,
  productName,
  cataloguePrice,
  price,
  salePrice,
  offerLabel,
  offerEndsAt,
  overridden,
}: {
  productId: string;
  size: string;
  productName: string;
  /** Rupees, from the catalogue file. */
  cataloguePrice: number;
  /** Rupees, currently in force. */
  price: number;
  salePrice: number | null;
  offerLabel: string | null;
  /** ISO date, for the date input. */
  offerEndsAt: string | null;
  overridden: boolean;
}) {
  const [state, action, pending] = useActionState<PriceFormState, FormData>(savePrice, {});

  return (
    <form action={action} className="border-b border-border p-4 last:border-0">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="size" value={size} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <p className="text-[15px] font-medium">{productName}</p>
          <p className="text-[13px] text-muted-foreground">
            {size}
            {!overridden && ` · catalogue ₹${cataloguePrice}`}
          </p>
        </div>

        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Price ₹
          <Input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={price}
            className="mt-1 h-10 w-28 rounded-md"
          />
        </label>

        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Offer ₹
          <Input
            name="salePrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="none"
            defaultValue={salePrice ?? ''}
            className="mt-1 h-10 w-28 rounded-md"
          />
        </label>

        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Label
          <Input
            name="offerLabel"
            placeholder="Festive 20% off"
            defaultValue={offerLabel ?? ''}
            className="mt-1 h-10 w-44 rounded-md"
          />
        </label>

        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Ends
          <Input
            name="offerEndsAt"
            type="date"
            defaultValue={offerEndsAt ?? ''}
            className="mt-1 h-10 w-40 rounded-md"
          />
        </label>

        <Button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md px-5 text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {state.error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">Saved.</p>
      )}
    </form>
  );
}
