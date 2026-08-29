import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[65vh] flex-col items-center justify-center px-4 text-center">
      <span className="eyebrow">Error 404</span>
      <h1 className="mt-4 font-headline text-5xl font-light tracking-tight md:text-6xl">
        This page doesn&apos;t exist
      </h1>
      <span className="rule-gold mt-8 w-full max-w-xs" aria-hidden="true" />
      <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground">
        The page you were looking for may have moved, or the formulation is no longer listed.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Link href="/">
          <Button className="rounded-md px-10 py-6 text-xs font-semibold uppercase tracking-[0.2em]">
            Back to home
          </Button>
        </Link>
        <Link href="/collections">
          <Button
            variant="outline"
            className="rounded-md px-10 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Browse products
          </Button>
        </Link>
      </div>
    </div>
  );
}
