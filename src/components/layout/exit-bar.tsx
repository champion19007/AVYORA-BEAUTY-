import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * The way out of a page shown without the shop's header (sign-in, sign-up,
 * staff sign-in). Without it the only exit was the browser's back button,
 * which an installed web app does not have, so people were stuck.
 */
export function ExitBar({ href = '/', label = 'Back to shop' }: { href?: string; label?: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-8">
      <Link href="/" className="font-headline text-2xl tracking-tight">
        Avyora
      </Link>
      <Link
        href={href}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    </div>
  );
}
