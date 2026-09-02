'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The Avyora header lockup: the group mark beside the Beauty sub-brand.
 *
 *   ┌──────────┐ │ ┌──────────┐
 *   │  A mark  │ │ │  lotus   │
 *   │  AVYORA  │ │ │  AVYORA  │
 *   │ tagline  │ │ │  BEAUTY  │
 *   └──────────┘ │ └──────────┘
 *     group      div   beauty
 *
 * Both marks are complete artwork — each already contains its own wordmark,
 * and the group mark carries the INSPIRE · CREATE · GROW line. Nothing here
 * re-renders that as text. An earlier version did: it drew the wordmark in
 * Foglihten, positioned a compass star inside the O by measured glyph offsets,
 * and built the gold tagline strip from flex rules. All of that duplicated
 * what the artwork now supplies, so it is gone — along with the alignment
 * constants that had to be re-measured whenever the typeface changed.
 *
 * ── The white card ────────────────────────────────────────────────────────
 *
 * Both files are opaque white PNGs, not transparent, and the group mark is
 * navy — invisible on a dark ground. Rather than key the white out (which
 * leaves halos on the antialiased curves of the swoosh and the star), each
 * sits on a white card in both themes. The card is the same colour as the
 * artwork's own background, so the seam does not show, and the navy reads
 * against it in dark mode exactly as in light.
 *
 * That is a deliberate change from the previous inverting badge, which worked
 * only because a cream-on-dark variant of the old logo had been generated to
 * pair with it. These are the supplied brand files, used as supplied.
 */

/** Group mark: navy A with the gold swoosh, wordmark and tagline. */
const GROUP_MARK = '/logo.png';

/** Sub-brand: the pink lotus with AVYORA BEAUTY. */
const BEAUTY_MARK = '/logo-beauty.png';

/**
 * The card both marks sit on.
 *
 * Light in both themes; see the note above. The border warms on hover so the
 * lockup reads as one clickable object rather than two separate images.
 */
const CARD =
  'rounded-xl border-2 border-primary/60 bg-white p-1.5 shadow-sm ' +
  'transition-colors duration-300 group-hover:border-primary';

/** Header size. Large enough that each wordmark is legible at a glance. */
const MARK_SIZE = 'h-[4.5rem] w-[4.5rem] md:h-[5.25rem] md:w-[5.25rem]';

/**
 * Shown if an image fails to load.
 *
 * A header that silently collapses to nothing is worse than a plain monogram:
 * the "home" affordance disappears with it.
 */
function MonogramFallback({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-lg bg-primary font-headline font-semibold text-primary-foreground',
        className
      )}
      aria-hidden="true"
    >
      A
    </span>
  );
}

/** One brand mark, with its own load-failure fallback. */
function Mark({
  src,
  alt,
  className,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MonogramFallback className={cn(className, 'rounded-lg text-2xl')} />;

  return (
    <Image
      src={src}
      alt={alt}
      width={512}
      height={512}
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      className={cn(className, 'object-contain')}
    />
  );
}

/**
 * The header lockup.
 *
 * The sub-brand is hidden below `md`. At phone widths the pair collides with
 * the search, bag and menu controls, and a squeezed lockup reads as broken
 * rather than compact.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex items-center gap-3', className)}
    >
      <span className={cn(CARD, 'shrink-0')}>
        {/* The group mark is above the fold on every page, so it is eager. */}
        <Mark
          src={GROUP_MARK}
          alt="Avyora — inspire, create, grow"
          sizes="(min-width: 768px) 84px, 72px"
          priority
          className={MARK_SIZE}
        />
      </span>

      <span className="hidden h-12 w-px shrink-0 bg-border md:block" aria-hidden="true" />

      <span className={cn(CARD, 'hidden shrink-0 md:inline-flex')}>
        <Mark
          src={BEAUTY_MARK}
          alt="Avyora Beauty"
          sizes="84px"
          className={MARK_SIZE}
        />
      </span>
    </Link>
  );
}

/**
 * Large centred lockup for the sign-in and splash screens.
 *
 * Only the group mark: those pages are about the account, not the product
 * line, and the pair at this size dominates the card it sits in.
 */
export function LogoDark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex flex-col items-center', className)}>
      <span className="rounded-2xl border-2 border-primary/60 bg-white p-3 shadow-sm">
        <Mark
          src={GROUP_MARK}
          alt="Avyora"
          sizes="176px"
          priority
          className="h-40 w-40 md:h-44 md:w-44"
        />
      </span>
    </span>
  );
}
