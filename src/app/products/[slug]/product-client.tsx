'use client';

import { Product } from '@/data/mock-data';
import Image from 'next/image';
import { useState } from 'react';
import { Star, Plus, Minus, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';
import { useApp } from '@/lib/store';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ProductCard } from '@/components/product/product-card';
import { cn } from '@/lib/utils';

export function ProductClient({ 
  product, 
  recommendations 
}: { 
  product: Product; 
  recommendations: Product[];
}) {
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]?.label || '');
  const [quantity, setQuantity] = useState(1);
  const { addToCart, wishlist, toggleWishlist } = useApp();

  const isWishlisted = wishlist.includes(product.id);

  return (
    <article className="container mx-auto px-4 py-8 md:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16 items-start">
        {/* Gallery Section */}
        <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
          <div className="flex md:flex-col gap-2 md:gap-4 overflow-x-auto md:overflow-y-auto no-scrollbar">
            {product.images.map((img, i) => (
              <button 
                key={i} 
                aria-label={`Show image ${i + 1}`}
                onClick={() => setCurrentImage(i)}
                className={cn(
                  "relative w-16 md:w-20 aspect-square border-2 shrink-0 transition-colors",
                  currentImage === i ? "border-foreground" : "border-transparent hover:border-muted"
                )}
              >
                <Image 
                  src={img} 
                  fill 
                  alt={`${product.name} thumbnail ${i + 1}`} 
                  className="object-cover"
                  sizes="(max-width: 768px) 64px, 80px"
                  data-ai-hint="skincare product"
                />
              </button>
            ))}
          </div>
          
          <div className="relative flex-1 aspect-[4/5] border bg-muted overflow-hidden">
            <Image 
              src={product.images[currentImage]} 
              fill 
              alt={product.name} 
              className="object-cover transition-transform duration-700 hover:scale-110" 
              priority 
              sizes="(max-width: 1024px) 100vw, 60vw"
              data-ai-hint="skincare bottle"
            />
            <button 
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              onClick={() => toggleWishlist(product.id)}
              className="absolute top-4 right-4 md:top-6 md:right-6 p-3 md:p-4 bg-white/50 backdrop-blur hover:bg-white transition-all z-10"
            >
              <Heart className={cn("h-5 w-5 md:h-6 md:w-6", isWishlisted && "fill-primary text-primary")} />
            </button>
          </div>
        </div>

        {/* Product Info Section */}
        <div className="lg:col-span-5 space-y-6 md:space-y-10">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">{product.category} Care</span>
              <h1 className="font-headline text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight mt-2 leading-tight">
                {product.name}
              </h1>
              {/* The tagline is a sentence, so it is set as one: no caps, no
                  bold, at a size that can actually be read at arm's length. */}
              <p className="mt-3 text-base md:text-lg leading-relaxed text-muted-foreground">
                {product.tagline}
              </p>
              {/*
                The catalogue carries a `description` for every product and the
                page never rendered it — customers saw only the one-line
                tagline. It is the main body copy on the page, so it leads at
                full reading size.
              */}
              <p className="mt-4 text-[15px] md:text-base leading-relaxed text-foreground/80">
                {product.description}
              </p>
            </div>

            {product.reviewCount && product.rating ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-foreground text-background px-3 py-1 text-[10px] font-semibold">
                  {product.rating} <Star className="h-3 w-3 ml-2 fill-primary text-primary" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {product.reviewCount.toLocaleString()} Reviews
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reviews yet — be the first to review this formulation.
              </p>
            )}

            <div className="flex items-baseline gap-4 pt-2">
              {/* salePrice, when set, is what the customer pays; price becomes the "was". */}
              <Price
                amount={product.salePrice ?? product.price}
                was={product.salePrice ? product.price : null}
                size="hero"
              />
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest">Select Size</span>
              <div className="flex flex-wrap gap-3 md:gap-4">
                {product.sizes.map(size => (
                  <button 
                    key={size.label}
                    onClick={() => setSelectedSize(size.label)}
                    className={cn(
                      "px-6 py-3 border-2 text-[10px] font-semibold uppercase tracking-widest transition-all",
                      selectedSize === size.label ? "bg-foreground text-background border-foreground" : "border-muted hover:border-primary"
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center border border-border h-14 md:h-16 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                <button 
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))} 
                  className="px-6 h-full hover:bg-muted transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-6 font-semibold text-sm" aria-label="Quantity">{quantity}</span>
                <button 
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(quantity + 1)} 
                  className="px-6 h-full hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button 
                className="flex-1 h-14 md:h-16 rounded-md bg-primary text-white font-semibold uppercase tracking-widest hover:bg-primary/90 text-[10px]"
                onClick={() => addToCart(product, selectedSize)}
              >
                Add to Cart
              </Button>
            </div>
          </div>

          <div className="pt-6 md:pt-10 border-t">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="ingredients">
                <AccordionTrigger className="py-4 text-xs font-semibold uppercase tracking-[0.18em]">Key Ingredients</AccordionTrigger>
                <AccordionContent className="pt-2 text-[15px] leading-relaxed text-muted-foreground">
                  {product.ingredients.join(', ')}. Formulated with high-purity actives.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="how-to-use">
                <AccordionTrigger className="py-4 text-xs font-semibold uppercase tracking-[0.18em]">How to Use</AccordionTrigger>
                <AccordionContent className="pt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Apply to cleansed skin. Use twice daily for best results, and wear SPF during
                  the day.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      <section className="mt-24 md:mt-32 pt-16 md:pt-24 border-t" aria-labelledby="recommendations-heading">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 gap-4">
          <h2 id="recommendations-heading" className="text-3xl md:text-4xl font-semibold tracking-tighter uppercase leading-none">You May Also Like</h2>
          <div className="h-1 w-24 bg-primary hidden md:block" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {recommendations.map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </article>
  );
}
