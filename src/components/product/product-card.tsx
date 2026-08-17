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
    <div className="group relative flex flex-col bg-white border border-transparent hover:border-border transition-all duration-300">
      <Link href={`/products/${product.slug}`} className="relative aspect-[4/5] overflow-hidden bg-muted">
        <Image
          src={product.images[currentImage]}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {product.images.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={prevImage} className="bg-white/80 p-1 hover:bg-white"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={nextImage} className="bg-white/80 p-1 hover:bg-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.isBestSeller && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase px-2 py-1 tracking-widest">
              Best Seller
            </span>
          )}
          {product.isNewLaunch && (
            <span className="bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2 py-1 tracking-widest">
              New Launch
            </span>
          )}
        </div>

        <button 
          onClick={(e) => { e.preventDefault(); toggleWishlist(product.id); }}
          className="absolute top-3 right-3 p-2 bg-white/50 backdrop-blur-sm hover:bg-white transition-colors"
        >
          <Heart className={cn("h-4 w-4", isWishlisted && "fill-accent text-accent")} />
        </button>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1 truncate">
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">
          {product.tagline}
        </p>
        
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center bg-muted px-1.5 py-0.5 rounded-sm">
            <span className="text-[10px] font-bold mr-1">{product.rating}</span>
            <Star className="h-2 w-2 fill-primary text-primary" />
          </div>
          <span className="text-[10px] text-muted-foreground">({product.reviewCount.toLocaleString()})</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {product.sizes.map((size) => (
            <button
              key={size.label}
              onClick={() => setSelectedSize(size.label)}
              className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-1 border transition-all",
                selectedSize === size.label 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-transparent text-muted-foreground border-border hover:border-primary"
              )}
            >
              {size.label}
            </button>
          ))}
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-sm font-bold">₹{product.price.toLocaleString()}</span>
            {product.salePrice && (
              <span className="text-[10px] text-muted-foreground line-through">₹{product.salePrice.toLocaleString()}</span>
            )}
          </div>
          <Button 
            className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[10px] py-6"
            onClick={() => addToCart(product, selectedSize)}
          >
            Add to Cart
          </Button>
        </div>
      </div>
    </div>
  );
}
