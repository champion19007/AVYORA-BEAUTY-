import { cn } from '@/lib/utils';
import Link from 'next/link';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2', className)}>
      <span className="text-xl font-headline font-bold tracking-tighter text-foreground">
        MINIMALIST
      </span>
    </Link>
  );
}

export function LogoDark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2', className)}>
      <span className="text-2xl font-headline font-bold tracking-tighter text-foreground">
        MINIMALIST
      </span>
    </Link>
  );
}
