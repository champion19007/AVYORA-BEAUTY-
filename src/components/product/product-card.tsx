
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { Product } from '@/data/mock-data';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ProductCard({ product }: { product: Product }) {
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0].label);
  const { addToCart, wishlist, toggleWishlist } = useApp();
  const isWishlisted = wishlist.includes(product.id);

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentImage((prev) => (prev + 1) % product.images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentImage((prev) => (prev - 1 + product.images.length) % product.images.length);
  };

  return (
    <div className="group relative flex flex-col bg-card border border-border hover:border-primary transition-all duration-500 shadow-sm hover:shadow-2xl">
      <Link href={`/products/${product.slug}`} className="relative aspect-[4/5] overflow-hidden bg-muted">
        <Image
          src={product.images[currentImage]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-1000 group-hover:scale-110"
          data-ai-hint="skincare product"
        />
        
        {product.images.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button onClick={prevImage} className="bg-background/80 p-2 hover:bg-primary hover:text-white transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={nextImage} className="bg-background/80 p-2 hover:bg-primary hover:text-white transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}

        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
          {product.isBestSeller && (
            <span className="bg-foreground text-background text-[8px] font-black uppercase px-2 py-1 tracking-widest shadow-sm">
              Best Seller
            </span>
          )}
          {product.isNewLaunch && (
            <span className="bg-primary text-primary-foreground text-[8px] font-black uppercase px-2 py-1 tracking-widest shadow-sm">
              New Launch
            </span>
          )}
        </div>

        <button 
          onClick={(e) => { e.preventDefault(); toggleWishlist(product.id); }}
          className="absolute top-4 right-4 p-2 bg-background/50 backdrop-blur-sm hover:bg-background transition-all border border-border z-10"
        >
          <Heart className={cn("h-4 w-4 transition-colors", isWishlisted ? "fill-primary text-primary" : "text-foreground")} />
        </button>
      </Link>

      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] mb-1 truncate leading-tight">
          <Link href={`/products/${product.slug}`} className="hover:text-primary transition-colors">{product.name}</Link>
        </h3>
        <p className="text-[8px] text-muted-foreground uppercase tracking-widest mb-4 font-bold truncate">
          {product.tagline}
        </p>
        
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center bg-muted/50 px-2 py-1 border border-border">
            <span className="text-[9px] font-black mr-1">{product.rating}</span>
            <Star className="h-2 w-2 fill-primary text-primary" />
          </div>
          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">({product.reviewCount.toLocaleString()})</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {product.sizes.map((size) => (
            <button
              key={size.label}
              onClick={() => setSelectedSize(size.label)}
              className={cn(
                "text-[8px] font-black uppercase tracking-widest px-3 py-1.5 border transition-all",
                selectedSize === size.label 
                  ? "bg-foreground text-background border-foreground" 
                  : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary"
              )}
            >
              {size.label}
            </button>
          ))}
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-2 mb-6">
            <span className="text-base font-black">₹{product.price.toLocaleString()}</span>
            {product.salePrice && (
              <span className="text-[10px] text-muted-foreground line-through font-bold">₹{product.salePrice.toLocaleString()}</span>
            )}
          </div>
          <Button 
            className="w-full bg-foreground text-background font-black uppercase tracking-widest text-[9px] py-7 rounded-none hover:bg-primary transition-all duration-300"
            onClick={() => addToCart(product, selectedSize)}
          >
            Add to Cart
          </Button>
        </div>
      </div>
    </div>
  );
}
