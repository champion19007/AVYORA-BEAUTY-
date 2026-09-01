'use client';

/**
 * ============================================================================
 * Avyora brand lockups
 * ============================================================================
 *
 * Two brands appear side by side in the header:
 *
 *   [ badge: group lockup ] │ [ lotus ]  AVYORA
 *                                        BEAUTY
 *                           ── INSPIRE ◆ CREATE ◆ GROW ──
 *
 *   - **Avyora** (parent) — navy and gold "A" emblem with its wordmark.
 *   - **Avyora Beauty** (sub-brand) — pink lotus, wordmark typeset beside it.
 *
 * ---------------------------------------------------------------------------
 * Why this is more complicated than dropping in an <img>
 * ---------------------------------------------------------------------------
 *
 * Both supplied artworks are **square**, with their wordmarks stacked *below*
 * the mark. A header is a horizontal bar, so a square lockup either renders
 * tiny or forces a very tall header. Each brand solves that differently:
 *
 *   - The group lockup is used whole, because its wordmark and tagline are
 *     part of the drawing and cannot be separated cleanly.
 *   - The sub-brand's lotus is cropped out and its words are typeset in HTML
 *     beside it, which keeps the pair to one header's height.
 *
 * ---------------------------------------------------------------------------
 * The badge inversion, and the constraint behind it
 * ---------------------------------------------------------------------------
 *
 * The badge ground is inverted against the page: navy on the light theme,
 * white on the dark one.
 *
 * That is only possible because of `logo-on-dark.png`. The supplied artwork
 * carries "AVYORA" and "INSPIRE · CREATE · GROW" in **navy pixels**, so on a
 * navy badge the wordmark reduces to a faint gold outline and the tagline
 * disappears entirely. `logo-on-dark.png` is generated from the original by
 * remapping those navy text pixels to cream, leaving the gold outlines,
 * diamonds and emblem untouched.
 *
 * **If a properly drawn dark-background original arrives, replace that file
 * and nothing else needs to change.**
 *
 * ---------------------------------------------------------------------------
 * Conventions used here
 * ---------------------------------------------------------------------------
 *
 *   - Colours come from tokens, never hex literals: gold from `primary`, the
 *     sub-brand pink from `--beauty-pink` in globals.css. Both flip with the
 *     theme without touching this file.
 *   - Every raster mark has an `onError` fallback to a typeset monogram, so a
 *     missing or renamed file degrades to something legible instead of a
 *     broken-image icon.
 *   - Decorative artwork is `aria-hidden`; the accessible name comes from the
 *     link's `aria-label` and the visible wordmark text.
 *   - Sizes are in `em` where they must scale with type (the star), and in
 *     fixed units where they must not (the marks).
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

/* -------------------------------------------------------------------------- */
/* Assets                                                                      */
/* -------------------------------------------------------------------------- */

/** Supplied group artwork. Navy wordmark, so it needs a light ground. */
const GROUP_LIGHT_GROUND = '/logo.png';

/** Generated variant with a cream wordmark, for dark grounds. See header note. */
const GROUP_DARK_GROUND = '/logo-on-dark.png';

/** Avyora Beauty lotus, cropped from the sub-brand lockup, white ground removed. */
const BEAUTY_MARK = '/logo-beauty.png';

/**
 * Badge ground, inverted against the page.
 *
 * `p-1.5` is deliberately tight: the artwork already carries its own internal
 * padding, so a larger inset makes the mark look lost inside the frame.
 */
const BADGE =
  'rounded-xl border-2 border-primary/70 bg-[hsl(224_60%_11%)] p-1.5 shadow-sm ' +
  'transition-colors duration-300 group-hover:border-primary dark:border-primary/80 dark:bg-white';

/** Group lockup dimensions, shared by both theme cuts so they cannot drift. */
const LOCKUP_SIZE = 'h-[4.25rem] w-[4.25rem] md:h-20 md:w-20';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Shown when an artwork file fails to load — a renamed asset, a bad deploy, a
 * blocked request. Better than a broken-image icon in the header.
 */
function MonogramFallback({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-lg bg-[hsl(224_60%_16%)] font-headline font-semibold text-primary',
        className
      )}
    >
      A
    </span>
  );
}

/** A decorative raster mark with a fallback. Never carries the accessible name. */
function Mark({ src, className, sizes }: { src: string; className?: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MonogramFallback className={cn('h-full w-full text-xl', className)} />;

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      sizes={sizes}
      priority
      onError={() => setFailed(true)}
      className={cn('object-contain', className)}
    />
  );
}

/**
 * The compass star from inside the O of the group wordmark, reused in the
 * sub-brand wordmark to tie the two together.
 *
 * Redrawn as SVG rather than cropped from the raster: it renders at roughly
 * 11px, where a crop would be mush, and as SVG it can take `currentColor`.
 *
 * Geometry: eight points at 45° intervals — four long cardinals (radius 48)
 * and four short diagonals (radius 27), meeting at a valley radius of 9. The
 * second path lightens one facet of each point so it reads as bevelled rather
 * than flat, matching the original.
 */
function CompassStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path
        d="M 50 2 L 53.4 41.7 L 69.1 30.9 L 58.3 46.6 L 98 50 L 58.3 53.4 L 69.1 69.1 L 53.4 58.3 L 50 98 L 46.6 58.3 L 30.9 69.1 L 41.7 53.4 L 2 50 L 41.7 46.6 L 30.9 30.9 L 46.6 41.7 Z"
        fill="currentColor"
      />
      <path
        d="M 50 50 L 50 2 L 53.4 41.7 Z M 50 50 L 69.1 30.9 L 58.3 46.6 Z M 50 50 L 98 50 L 58.3 53.4 Z M 50 50 L 69.1 69.1 L 53.4 58.3 Z M 50 50 L 50 98 L 46.6 58.3 Z M 50 50 L 30.9 69.1 L 41.7 53.4 Z M 50 50 L 2 50 L 41.7 46.6 Z M 50 50 L 30.9 30.9 L 46.6 41.7 Z"
        fill="#FFFFFF"
        fillOpacity="0.35"
      />
    </svg>
  );
}

/** Gold lozenge used as a word separator in the tagline strip. */
function Diamond() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1 w-1 rotate-45 bg-primary md:h-[5px] md:w-[5px]"
    />
  );
}

/**
 * The "INSPIRE ◆ CREATE ◆ GROW" strip.
 *
 * Typeset rather than cropped so it stays crisp and can be recoloured.
 *
 * The rules are `flex-1` so they stretch to fill the sub-brand's width, which
 * is what makes this read as one strip rather than a stub beside the text.
 * They also carry a `min-w`, because once the wording was enlarged the text
 * consumed the whole row and the rules collapsed to nothing.
 */
function TaglineStrip({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 md:gap-2', className)}>
      <span
        aria-hidden="true"
        className="h-px min-w-[14px] flex-1 bg-gradient-to-r from-transparent to-primary"
      />
      <span className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.24em] text-primary md:gap-2.5 md:text-[10px]">
        Inspire
        <Diamond />
        Create
        <Diamond />
        Grow
      </span>
      <span
        aria-hidden="true"
        className="h-px min-w-[14px] flex-1 bg-gradient-to-l from-transparent to-primary"
      />
    </span>
  );
}

/**
 * The group lockup, swapped by theme.
 *
 * Both cuts are rendered and one hidden with a `dark:` class, rather than
 * picking one in JavaScript. Reading the theme in JS requires the client to
 * mount first, which flashes the wrong artwork on load and cannot be
 * prerendered — and these pages are statically generated.
 */
function GroupLockup() {
  const [failed, setFailed] = useState(false);
  if (failed) return <MonogramFallback className={cn(LOCKUP_SIZE, 'rounded-lg text-2xl')} />;

  const common = cn(LOCKUP_SIZE, 'object-contain');
  return (
    <>
      {/* Light theme → navy badge → the cream-wordmark cut. Carries the alt text. */}
      <Image
        src={GROUP_DARK_GROUND}
        alt="Avyora"
        width={512}
        height={512}
        sizes="80px"
        priority
        onError={() => setFailed(true)}
        className={cn(common, 'block dark:hidden')}
      />
      {/* Dark theme → white badge → the supplied cut. Hidden from AT to avoid a duplicate name. */}
      <Image
        src={GROUP_LIGHT_GROUND}
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        sizes="80px"
        className={cn(common, 'hidden dark:block')}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Header lockup: the group badge, a divider, then the Avyora Beauty sub-brand.
 *
 * Layout notes for anyone changing this:
 *
 *   - The sub-brand is a **column**: lotus and wordmark on one row, tagline
 *     strip beneath both. Putting the strip inside the text column instead
 *     starts it to the right of the lotus and leaves a visible gap under the
 *     flower.
 *   - The sub-brand is hidden below `md`. The full pair is ~250px wide and
 *     collided with the header icons at 420px. The group lockup already
 *     carries the AVYORA name, so it is the safe half to drop.
 *   - The header bar is deliberately not Tailwind's `container` (see
 *     `header.tsx`): that centres and caps the width, leaving a large empty
 *     gap in the top-left corner on wide screens.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex items-center gap-3', className)}
    >
      <span className={cn(BADGE, 'shrink-0')}>
        <GroupLockup />
      </span>

      <span className="hidden h-10 w-px shrink-0 bg-border md:block md:h-12" aria-hidden="true" />

      <span className="hidden flex-col md:flex">
        <span className="flex items-center gap-3">
          <Mark src={BEAUTY_MARK} sizes="72px" className="h-14 w-14 shrink-0 md:h-16 md:w-16" />

          <span className="flex flex-col justify-center leading-none">
            {/*
              The O is split out so the compass star can sit in its counter.

              `inset-0 m-auto` centres the star in the span's *box*, which is
              not the centre of the letter. Two things pull it off:

                - Vertically, a glyph sits on a baseline with ascender space
                  above it, so box-centring leaves the star riding low. The O's
                  ink centre measures 0.063em above the box centre.
                - Horizontally, the 0.12em letter-spacing is appended *after*
                  the glyph, widening the box to the right and pushing a
                  box-centred star 0.067em past the letter.

              Hence the two nudges. Size and offsets are all in `em` so they
              hold at any font size, but they were measured against Foglihten
              at this weight and should be re-measured if either changes.

              The text nodes still concatenate to "AVYORA", so assistive
              technology reads one word rather than three fragments.
            */}
            <span
              className="font-headline text-xl font-semibold tracking-[0.12em] md:text-2xl"
              style={{ color: 'var(--beauty-pink)' }}
            >
              AVY
              <span className="relative inline-block">
                O
                <CompassStar className="absolute inset-0 m-auto h-[0.42em] w-[0.42em] -translate-x-[0.067em] -translate-y-[0.063em] text-primary" />
              </span>
              RA
            </span>

            <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.34em] text-foreground/80 md:text-[13px]">
              Beauty
            </span>
          </span>
        </span>

        <TaglineStrip className="mt-1.5 self-stretch justify-center" />
      </span>
    </Link>
  );
}

/**
 * Large centred lockup for authentication and splash screens.
 *
 * Kept on a light ground in **both** themes, unlike the header badge: this one
 * shows the supplied artwork whole, and its navy wordmark would disappear on
 * an inverted ground.
 */
export function LogoDark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex flex-col items-center', className)}
    >
      {failed ? (
        <MonogramFallback className="h-24 w-24 rounded-xl text-4xl" />
      ) : (
        <span className="rounded-xl border-2 border-primary/70 bg-white p-3 shadow-sm">
          <Image
            src={GROUP_LIGHT_GROUND}
            alt="Avyora"
            width={512}
            height={512}
            sizes="176px"
            priority
            onError={() => setFailed(true)}
            className="h-44 w-44 object-contain transition-transform duration-700 group-hover:scale-[1.03]"
          />
        </span>
      )}
    </Link>
  );
}
