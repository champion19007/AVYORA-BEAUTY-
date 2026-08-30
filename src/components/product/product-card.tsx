'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { Product } from '@/data/mock-data';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';
import { cn } from '@/lib/utils';

export function ProductCard({ product }: { product: Product }) {
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0].label);
  const { addToCart, wishlist, toggleWishlist } = useApp();
  const isWishlisted = wishlist.includes(product.id);

  // Each size carries its own price, so the displayed figure has to follow
  // the selection rather than always quoting the base SKU.
  const activeSize = product.sizes.find((s) => s.label === selectedSize) ?? product.sizes[0];
  // `salePrice`, when set, is the discounted figure the customer pays.
  const currentPrice = product.salePrice ?? activeSize.price;
  const wasPrice = product.salePrice ? activeSize.price : null;

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentImage((prev) => (prev + 1) % product.images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentImage((prev) => (prev - 1 + product.images.length) % product.images.length);
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-luxe-lg">
      <Link
        href={`/products/${product.slug}`}
        className="relative aspect-[4/5] overflow-hidden bg-muted"
      >
        <Image
          src={product.images[currentImage]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform [transition-duration:1200ms] ease-out group-hover:scale-105"
          data-ai-hint="skincare product"
        />

        {product.images.length > 1 && (
          <div className="absolute inset-0 z-10 flex items-center justify-between px-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <button
              onClick={prevImage}
              aria-label="Previous image"
              className="rounded-full bg-background/85 p-2 backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextImage}
              aria-label="Next image"
              className="rounded-full bg-background/85 p-2 backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
          {product.isBestSeller && (
            <span className="rounded-full bg-foreground/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-background backdrop-blur-sm">
              Best Seller
            </span>
          )}
          {product.isNewLaunch && (
            <span className="rounded-full bg-primary px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary-foreground">
              New
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={isWishlisted}
          className="absolute right-4 top-4 z-10 rounded-full border border-border/60 bg-background/70 p-2 backdrop-blur-sm transition-all hover:bg-background"
        >
          <Heart
            className={cn(
              'h-4 w-4 transition-colors',
              isWishlisted ? 'fill-primary text-primary' : 'text-foreground'
            )}
          />
        </button>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-headline text-xl font-semibold leading-snug tracking-wide">
          <Link href={`/products/${product.slug}`} className="transition-colors hover:text-primary">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {product.tagline}
        </p>

        {product.reviewCount && product.rating ? (
          <div className="mt-4 flex items-center gap-2">
            <span className="flex items-center gap-1 text-[13px] font-medium">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              {product.rating}
            </span>
            <span className="text-xs text-muted-foreground">
              ({product.reviewCount.toLocaleString()} reviews)
            </span>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">No reviews yet</p>
        )}

        {product.sizes.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Select size">
            {product.sizes.map((size) => (
              <button
                key={size.label}
                onClick={() => setSelectedSize(size.label)}
                aria-pressed={selectedSize === size.label}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
                  selectedSize === size.label
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto pt-6">
          <div className="mb-4 flex items-baseline gap-2">
            <Price amount={currentPrice} was={wasPrice} size="lg" />
            {product.sizes.length === 1 && (
              <span className="ml-auto text-xs text-muted-foreground">{activeSize.label}</span>
            )}
          </div>
          <Button
            className="w-full rounded-md bg-foreground py-6 text-xs font-semibold uppercase tracking-[0.2em] text-background transition-colors duration-300 hover:bg-primary hover:text-primary-foreground"
            onClick={() => addToCart(product, selectedSize)}
          >
            Add to Bag
          </Button>
        </div>
      </div>
    </article>
  );
}
