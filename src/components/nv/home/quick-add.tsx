'use client';

import { useId, useState } from 'react';
import { Check, ShoppingBag } from 'lucide-react';
import { useApp } from '@/lib/store';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { SkuOffer } from './data';

/**
 * Size choice and add-to-bag for one product, the only client code in a
 * landing card. "In bag" is read from the bag itself, so repeat clicks
 * cannot add more units; out-of-stock sizes cannot be added. The bag and
 * checkout recheck price and stock.
 */
export function QuickAdd({
  productId,
  productName,
  skus,
  onImage = true,
}: {
  productId: string;
  productName: string;
  skus: SkuOffer[];
  onImage?: boolean;
}) {
  const { addToCart, cart } = useApp();
  const firstAvailable = skus.find((s) => s.inStock) ?? skus[0];
  const [size, setSize] = useState(firstAvailable.size);
  const id = useId();
  const sku = skus.find((s) => s.size === size) ?? firstAvailable;
  const inBag = cart.some((c) => c.productId === productId && c.size === sku.size);
  const tone = onImage
    ? 'border-white/40 bg-white/15 text-white backdrop-blur-sm'
    : 'border-nv-line bg-nv-card text-nv-ink';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {skus.length > 1 ? (
        <>
          <label htmlFor={id} className="sr-only">
            Size of {productName}
          </label>
          <select
            id={id}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={cn('nv-focus h-10 rounded-nv-pill border px-4 text-nv-label', tone)}
          >
            {skus.map((s) => (
              <option key={s.size} value={s.size} className="text-nv-ink">
                {s.size} · {formatPaise(s.pricePaise)}
                {s.inStock ? '' : ' (sold out)'}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className={cn('inline-flex h-10 items-center rounded-nv-pill border px-4 text-nv-label', tone)}>
          {sku.size} · {formatPaise(sku.pricePaise)}
        </span>
      )}
      <button
        type="button"
        disabled={!sku.inStock || inBag}
        onClick={() => addToCart(productId, sku.size, 1)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-nv-pill px-4 text-nv-label transition-colors duration-nv-control disabled:cursor-not-allowed',
          onImage
            ? 'nv-focus-light bg-white text-nv-ink hover:bg-white/90 disabled:bg-white/60'
            : 'nv-focus bg-nv-ink text-white hover:bg-nv-accent disabled:bg-nv-faint'
        )}
      >
        {inBag ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
        )}
        {!sku.inStock ? 'Sold out' : inBag ? 'In bag' : 'Add'}
        <span className="sr-only">
          {' '}
          {productName}, {sku.size}
        </span>
      </button>
    </div>
  );
}
