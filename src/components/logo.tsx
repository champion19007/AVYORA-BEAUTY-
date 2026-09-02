import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Brand placeholder.
 *
 * The artwork has been withdrawn while the branding is reworked, so every
 * logo slot renders the word LOGO in a bordered box rather than an image.
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

/** Header size. Wide enough for the word, tall enough to match the old mark. */
const PLACEHOLDER_SIZE = 'h-14 w-28 md:h-16 md:w-32';

/**
 * The bordered box.
 *
 * `aria-hidden` because the accessible name comes from the link that wraps it;
 * without that, a screen reader would announce "LOGO, Avyora — home".
 */
function Placeholder({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-xl border-2 border-dashed border-primary/50',
        'bg-muted/30 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground',
        'transition-colors duration-300 group-hover:border-primary group-hover:text-primary',
        className
      )}
    >
      Logo
    </span>
  );
}

/** The header brand mark, and the link home. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex items-center', className)}
    >
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
      <Placeholder className="h-24 w-48 text-sm" />
    </span>
  );
}
