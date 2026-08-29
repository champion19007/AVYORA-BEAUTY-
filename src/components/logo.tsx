'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

/**
 * Logo component optimized for the new Gold and Blue clinical branding.
 * Fixed for precise top-left placement in navigation.
 */
export function Logo({ className }: { className?: string }) {
  const logoImage = PlaceHolderImages.find(img => img.id === 'avyora-logo')?.imageUrl || '';

  return (
    <Link href="/" className={cn('flex items-center gap-3 group', className)}>
      <div className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-primary bg-foreground flex items-center justify-center shrink-0">
        <Image 
          src={logoImage} 
          alt="Avyora Icon" 
          width={44} 
          height={44} 
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          data-ai-hint="clinical logo"
        />
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-xl font-black tracking-tighter text-foreground uppercase leading-[0.8] mb-1">
          AVYORA
        </span>
        <span className="text-[7px] font-bold tracking-[0.3em] text-primary uppercase opacity-80">
          Inspire • Create • Grow
        </span>
      </div>
    </Link>
  );
}

/**
 * Large, centered logo variant for authentication and splash screens.
 */
export function LogoDark({ className }: { className?: string }) {
  const logoImage = PlaceHolderImages.find(img => img.id === 'avyora-logo')?.imageUrl || '';

  return (
    <Link href="/" className={cn('flex flex-col items-center gap-4 group', className)}>
      <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-primary bg-foreground flex items-center justify-center shadow-2xl">
        <Image 
          src={logoImage} 
          alt="Avyora Icon" 
          width={96} 
          height={96} 
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          data-ai-hint="clinical logo"
        />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tighter text-foreground uppercase leading-none">
          AVYORA
        </h1>
        <p className="text-[11px] font-black tracking-[0.5em] text-primary uppercase mt-4">
          Inspire • Create • Grow
        </p>
      </div>
    </Link>
  );
}
