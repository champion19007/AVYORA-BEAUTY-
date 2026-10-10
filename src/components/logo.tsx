import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Brand mark.
 *
 * The artwork has been withdrawn while the branding is reworked, so every
 * logo slot renders the Avyora wordmark as text rather than an image.
 *
 * A visible placeholder, not an empty space, and deliberately so: the logo is
 * the "home" affordance in the header, and a blank gap would remove the only
 * way back to the homepage from every page on the site. It also keeps the
 * header's height and rhythm stable, so dropping the real mark back in later
 * is a change to this file alone and nothing reflows.
 *
 * The sub-brand mark that used to sit beside it is gone entirely — one
 * placeholder, not two. Two identical boxes labelled LOGO would say nothing
 * about there being two brands.
 *
 * ── Putting artwork back ──────────────────────────────────────────────────
 *
 * Replace `Placeholder` with a `next/image` pointing at the new file. Keep the
 * `Link`, the `aria-label` and the size classes; those are what make the mark
 * a working home link rather than decoration.
 */

/** Header size: the wordmark's box, matching the old mark's height so nothing reflows. */
const PLACEHOLDER_SIZE = 'h-14 md:h-16 text-[28px]';

/**
 * The "Avyora" wordmark in the redesign's serif, standing in until the
 * reworked artwork exists (it replaced a dashed box reading LOGO, which
 * looked unfinished on the sign-in page).
 *
 * `aria-hidden` because the accessible name comes from the link that wraps it.
 */
function Placeholder({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center font-wordmark leading-none tracking-[-0.02em] text-foreground',
        'transition-colors duration-300 group-hover:text-primary',
        className
      )}
    >
      Avyora
    </span>
  );
}

/** The header brand mark, and the link home. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Avyora — home" className={cn('group flex items-center', className)}>
      <Placeholder className={cn(PLACEHOLDER_SIZE, 'shrink-0')} />
    </Link>
  );
}

/**
 * Larger placeholder for the sign-in and splash screens.
 *
 * Not a link: those pages are a dead end by design, and a stray route home
 * mid-sign-in loses whatever the customer was doing.
 */
export function LogoDark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex', className)}>
      <Placeholder className="h-16 text-[44px]" />
    </span>
  );
}
