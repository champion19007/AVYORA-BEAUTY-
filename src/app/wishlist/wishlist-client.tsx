'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useApp } from '@/lib/store';
import { getProductById } from '@/lib/catalogue';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';

/**
 * The saved-items grid.
 *
 * Ids are resolved against the catalogue rather than storing whole products in
 * localStorage: a saved copy would keep showing a stale price, or a product
 * that has since been withdrawn. Ids that no longer resolve are dropped
 * silently — a retired SKU should quietly disappear from the list, not render
 * a broken card.
 */
export function WishlistClient() {
  const { wishlist } = useApp();

  const products = wishlist
    .map((id) => getProductById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-16">
      <header>
        <h1 className="flex items-center gap-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
          <Heart className="h-8 w-8 text-primary" aria-hidden="true" />
          Your Wishlist
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {products.length === 0
            ? 'Nothing saved yet.'
            : `${products.length} formulation${products.length === 1 ? '' : 's'} saved.`}
        </p>
      </header>

      {products.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border p-12 text-center">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Tap the heart on any product to save it here for later.
          </p>
          <Link href="/collections">
            <Button className="mt-6 rounded-md px-8 py-6 text-xs font-semibold uppercase tracking-[0.2em]">
              Browse products
            </Button>
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* The list lives in this browser only. Saying so is better than a
          customer assuming it follows them to their phone and finding it gone. */}
      {products.length > 0 && (
        <p className="mt-12 border-t border-border pt-6 text-[13px] leading-relaxed text-muted-foreground">
          Your wishlist is saved on this device.
        </p>
      )}
    </div>
  );
}
