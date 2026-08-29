
'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

/**
 * Logo component optimized for the new Gold and Blue clinical branding.
 */
export function Logo({ className }: { className?: string }) {
  const logoImage = PlaceHolderImages.find(img => img.id === 'avyora-logo')?.imageUrl || '';

  return (
    <Link href="/" className={cn('flex items-center gap-3 group', className)}>
      <div className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-primary bg-foreground flex items-center justify-center">
        <Image 
          src={logoImage} 
          alt="Avyora Icon" 
          width={40} 
          height={40} 
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          data-ai-hint="clinical logo"
        />
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-black tracking-tighter text-foreground uppercase leading-none">
          AVYORA
        </span>
        <span className="text-[7px] font-bold tracking-[0.3em] text-primary uppercase mt-1 opacity-80">
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
      <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-primary bg-foreground flex items-center justify-center shadow-xl">
        <Image 
          src={logoImage} 
          alt="Avyora Icon" 
          width={80} 
          height={80} 
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          data-ai-hint="clinical logo"
        />
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
          AVYORA
        </h1>
        <p className="text-[10px] font-black tracking-[0.5em] text-primary uppercase mt-3">
          Inspire • Create • Grow
        </p>
      </div>
    </Link>
  );
}
