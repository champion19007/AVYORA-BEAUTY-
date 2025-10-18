import { WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <WalletCards className="h-7 w-7 text-primary-foreground" />
      <span className="text-xl font-headline font-semibold text-primary-foreground">
        PayConnect
      </span>
    </div>
  );
}

export function LogoDark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <WalletCards className="h-8 w-8 text-primary" />
      <span className="text-2xl font-headline font-semibold text-foreground">
        PayConnect
      </span>
    </div>
  );
}
