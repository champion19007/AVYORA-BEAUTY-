
'use client';

import { PRODUCTS } from '@/data/mock-data';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useState, useMemo } from 'react';
import { Star, Plus, Minus, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ProductCard } from '@/components/product/product-card';
import { cn } from '@/lib/utils';
import Script from 'next/script';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const product = PRODUCTS.find(p => p.slug === slug);
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product?.sizes[0]?.label || '');
  const [quantity, setQuantity] = useState(1);
  const { addToCart, wishlist, toggleWishlist } = useApp();

  const jsonLd = useMemo(() => {
    if (!product) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      image: product.images,
      description: product.description,
      brand: {
        '@type': 'Brand',
        name: 'Avyora',
      },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: product.price,
        highPrice: product.sizes[product.sizes.length - 1].price,
        offerCount: product.sizes.length,
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating,
        reviewCount: product.reviewCount,
      },
    };
  }, [product]);

  if (!product) return <div className="p-20 text-center uppercase text-[10px] font-black">Product not found</div>;

  const isWishlisted = wishlist.includes(product.id);
  const recommendations = PRODUCTS.filter(p => p.id !== product.id).slice(0, 4);

  return (
    <article className="container mx-auto px-4 py-8 md:py-16">
      {jsonLd && (
        <Script
          id="product-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16 items-start">
        {/* Gallery Section */}
        <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
          {/* Thumbnails */}
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
          
          {/* Main Image Container */}
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
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">{product.category} Care</span>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter mt-2 leading-none">{product.name}</h1>
              <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-muted-foreground mt-4 leading-relaxed">{product.tagline}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center bg-foreground text-background px-3 py-1 text-[10px] font-black">
                {product.rating} <Star className="h-3 w-3 ml-2 fill-primary text-primary" aria-hidden="true" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{product.reviewCount.toLocaleString()} Reviews</span>
            </div>

            <div className="flex items-baseline gap-4 pt-2">
              <span className="text-3xl md:text-4xl font-black">₹{product.price.toLocaleString()}</span>
              {product.salePrice && (
                <span className="text-lg md:text-xl text-muted-foreground line-through italic font-bold">₹{product.salePrice.toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest">Select Size</span>
              <div className="flex flex-wrap gap-3 md:gap-4">
                {product.sizes.map(size => (
                  <button 
                    key={size.label}
                    onClick={() => setSelectedSize(size.label)}
                    className={cn(
                      "px-6 py-3 border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                      selectedSize === size.label ? "bg-foreground text-background border-foreground" : "border-muted hover:border-primary"
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center border-2 border-foreground h-14 md:h-16 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                <button 
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))} 
                  className="px-6 h-full hover:bg-muted transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-6 font-black text-sm" aria-label="Quantity">{quantity}</span>
                <button 
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(quantity + 1)} 
                  className="px-6 h-full hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button 
                className="flex-1 h-14 md:h-16 rounded-none bg-primary text-white font-black uppercase tracking-widest hover:bg-primary/90 text-[10px]"
                onClick={() => addToCart(product, selectedSize)}
              >
                Add to Cart
              </Button>
            </div>
          </div>

          <div className="pt-6 md:pt-10 border-t">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="ingredients">
                <AccordionTrigger className="text-[10px] font-black uppercase tracking-widest py-4">Key Ingredients</AccordionTrigger>
                <AccordionContent className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground leading-loose pt-2">
                  {product.ingredients.join(', ')}. Optimized for clinical results with high-purity actives.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="how-to-use">
                <AccordionTrigger className="text-[10px] font-black uppercase tracking-widest py-4">How to Use</AccordionTrigger>
                <AccordionContent className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground leading-loose pt-2">
                  Apply on cleansed face/body. Use twice daily for optimal results. Ensure SPF protection during daylight hours.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Recommended Section */}
      <section className="mt-24 md:mt-32 pt-16 md:pt-24 border-t" aria-labelledby="recommendations-heading">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 gap-4">
          <h2 id="recommendations-heading" className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-none">You May Also Like</h2>
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
