'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setStock } from './actions';

/**
 * The owner's stock edit, behind a second question.
 *
 * Stock counts belong to whoever is at the shelf. The owner is not, so a
 * number typed here overwrites what the manager physically counted with a
 * recollection. The ability is kept — the manager is sometimes off sick — but
 * it should never happen by reflex.
 *
 * The confirmation is not decoration: `setStock` refuses to act without the
 * `confirmed` field, so a script posting the form without passing through this
 * step is rejected server-side too.
 */
export function ConfirmStockForm({
  productId,
  size,
  productName,
  currentQuantity,
}: {
  productId: string;
  size: string;
  productName: string;
  currentQuantity: number;
}) {
  const [quantity, setQuantity] = useState(String(currentQuantity));
  const [confirming, setConfirming] = useState(false);

  const changed = Number(quantity) !== currentQuantity;

  if (confirming) {
    return (
      <form action={setStock} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="size" value={size} />
        <input type="hidden" name="quantity" value={quantity} />
        <input type="hidden" name="confirmed" value="yes" />

        <span className="text-[13px] leading-snug text-amber-700 dark:text-amber-400">
          Set {productName} {size} to <strong>{quantity}</strong>, replacing {currentQuantity}?
          The stockroom counted this.
        </span>

        <Button
          type="submit"
          className="h-9 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          Yes, overwrite
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          className="h-9 rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        aria-label={`Stock for ${productName} ${size}`}
        className="h-10 w-24 rounded-md"
      />
      <Button
        type="button"
        variant="outline"
        disabled={!changed}
        onClick={() => setConfirming(true)}
        className="h-10 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
      >
        Change
      </Button>
    </div>
  );
}
