'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

/**
 * Path to the brand artwork. Save the master logo file at `public/logo.png`.
 * Until it exists, the components below fall back to a typeset gold monogram
 * so the header never shows a broken image.
 */
const LOGO_SRC = '/logo.png';

/** Typeset stand-in used when the artwork file is missing. */
function MonogramFallback({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center rounded-full border border-primary/50 bg-[hsl(224_60%_16%)] font-headline font-semibold text-primary',
        className
      )}
    >
      A
    </span>
  );
}

/**
 * The supplied artwork is a square lockup: the gilded "A" emblem occupies
 * roughly the top three quarters, with the AVYORA wordmark beneath it. In the
 * header we crop to the emblem alone and typeset the wordmark beside it, so
 * the brand name is never rendered twice.
 */
function EmblemCrop({ className, sizes }: { className?: string; sizes: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MonogramFallback className={cn('text-lg', className)} />;

  return (
    <span className={cn('relative block overflow-hidden', className)}>
      <Image
        src={LOGO_SRC}
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        sizes={sizes}
        priority
        onError={() => setFailed(true)}
        className="absolute left-1/2 top-0 w-[136%] max-w-none -translate-x-1/2"
      />
    </span>
  );
}

/**
 * Primary navigation lockup: cropped emblem plus typeset wordmark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex items-center gap-3', className)}
    >
      <EmblemCrop className="h-11 w-11 shrink-0" sizes="44px" />
      <span className="flex flex-col justify-center">
        <span className="font-headline text-2xl font-semibold leading-none tracking-[0.14em] text-foreground transition-colors group-hover:text-primary">
          AVYORA
        </span>
        <span className="mt-1 text-[7px] font-medium uppercase tracking-[0.34em] text-primary">
          Inspire · Create · Grow
        </span>
      </span>
    </Link>
  );
}

/**
 * Large centred variant for authentication and splash screens. Shows the
 * artwork whole, since there is room for the wordmark to read properly.
 */
export function LogoDark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href="/"
      aria-label="Avyora — home"
      className={cn('group flex flex-col items-center gap-3', className)}
    >
      {failed ? (
        <>
          <MonogramFallback className="h-20 w-20 text-4xl" />
          <span className="font-headline text-3xl font-semibold tracking-[0.14em]">AVYORA</span>
          <span className="text-[9px] font-medium uppercase tracking-[0.34em] text-primary">
            Inspire · Create · Grow
          </span>
        </>
      ) : (
        <Image
          src={LOGO_SRC}
          alt="Avyora"
          width={320}
          height={320}
          sizes="160px"
          priority
          onError={() => setFailed(true)}
          className="h-40 w-40 object-contain transition-transform duration-700 group-hover:scale-[1.03]"
        />
      )}
    </Link>
  );
}
