'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { promotionBadge, promotionDetail } from '@/modules/offers/promotions';
import { promotionsFor, usePromotions } from '@/lib/use-promotions';

/**
 * "Buy 2, get 1 free" on any product an automatic offer covers. Renders
 * nothing until offers have loaded, or when none applies.
 */
export function PromoBadge({ productId, className }: { productId: string; className?: string }) {
  const [promotion] = promotionsFor(usePromotions(), productId);
  if (!promotion) return null;
  return (
    <span
      className={cn(
        'rounded-full bg-amber-300 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-950',
        className
      )}
    >
      {promotionBadge(promotion)}
    </span>
  );
}

/** The offer explained on a product page, with a way to see everything it covers. */
export function PromoDetails({ productId }: { productId: string }) {
  const offers = promotionsFor(usePromotions(), productId);
  if (offers.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Offers on this product">
      {offers.map((p) => (
        <li key={p.id} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{promotionBadge(p)}</p>
          <p className="mt-0.5 leading-relaxed">{promotionDetail(p)}</p>
          {p.productIds && (
            <Link href={`/collections?offer=${p.id}`} className="mt-1 inline-block underline underline-offset-2">
              See all {p.productIds.length} eligible products
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
