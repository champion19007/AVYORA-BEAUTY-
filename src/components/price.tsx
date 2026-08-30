import { cn } from '@/lib/utils';

/**
 * The single place a price is rendered.
 *
 * Prices were previously styled ad hoc on each surface: Cinzel with a gold
 * gradient on product cards, Jost at weight 600 on the detail page, plain body
 * text in the routine finder, and something else again at checkout. Two
 * problems came out of that:
 *
 *  1. **Cinzel has no rupee glyph.** `document.fonts.check('30px Cinzel', '₹')`
 *     returns false, so on cards the ₹ silently fell back to another typeface
 *     while the digits stayed in Cinzel — a visibly mismatched number. Cinzel
 *     is a Roman capitals face anyway; its digits are not built to sit in a
 *     price.
 *  2. The gold gradient rendered dark-gold text on a cream ground, which is
 *     both low contrast and thin at small sizes.
 *
 * Prices are therefore always set in the body face, with tabular figures so
 * columns of prices align and a total does not jitter as digits change.
 */

const SIZES = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
  hero: 'text-3xl md:text-4xl',
} as const;

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/** Formats rupees the Indian way (₹1,49,999), dropping empty decimals. */
export function formatPrice(rupees: number): string {
  return formatter.format(rupees).replace(/\.00$/, '');
}

export function Price({
  amount,
  was,
  size = 'base',
  className,
}: {
  /** Amount in whole rupees. */
  amount: number;
  /** Original price, shown struck through when the item is discounted. */
  was?: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className={cn('font-body font-medium tabular-nums text-foreground', SIZES[size])}>
        {formatPrice(amount)}
      </span>
      {was != null && was > amount && (
        <>
          <span className="font-body text-sm tabular-nums text-muted-foreground line-through">
            {formatPrice(was)}
          </span>
          <span className="sr-only">reduced from {formatPrice(was)}</span>
        </>
      )}
    </span>
  );
}
