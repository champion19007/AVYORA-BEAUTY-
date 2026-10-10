'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An image in a box of fixed aspect ratio (the measured slot), so neither
 * loading nor failure moves anything around it.
 *
 * - Loading: the neutral surface shows through until the image paints. The
 *   image is never hidden by script, so it appears without JavaScript too.
 * - Failure: the box keeps its size and shows the alternative text, so the
 *   meaning survives and nothing collapses.
 * - Crops are `object-fit: cover`, centred unless a focal point is given,
 *   as in the reference.
 */
export function NvImage({
  ratio,
  radius = 'card',
  focal = '50% 50%',
  className,
  alt,
  onDark,
  ...image
}: Omit<ImageProps, 'fill' | 'width' | 'height' | 'placeholder'> & {
  /** width / height of the slot, e.g. 616 / 585. */
  ratio: number;
  radius?: 'card' | 'inner' | 'none';
  /** CSS object-position, for keeping a face or product in frame. */
  focal?: string;
  /** Use a dark fallback surface (full-bleed photography sections). */
  onDark?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden',
        radius === 'card' ? 'rounded-nv-card' : radius === 'inner' ? 'rounded-nv-inner' : '',
        onDark ? 'bg-[#2a2a2a]' : 'bg-nv-line',
        className
      )}
      style={{ aspectRatio: String(ratio) }}
      data-image-state={failed ? 'failed' : 'ok'}
    >
      {failed ? (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-nv-small',
            onDark ? 'text-white/80' : 'text-nv-muted'
          )}
        >
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span>{alt || 'Image unavailable'}</span>
        </div>
      ) : (
        <Image
          {...image}
          alt={alt}
          fill
          style={{ objectFit: 'cover', objectPosition: focal }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
