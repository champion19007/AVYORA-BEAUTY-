'use client';

import { PRODUCTS } from '@/data/mock-data';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { Star, Plus, Minus, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ProductCard } from '@/components/product/product-card';
import { cn } from '@/lib/utils';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const product = PRODUCTS.find(p => p.slug === slug);
  const [currentImage, setCurrentImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product?.sizes[0]?.label || '');
  const [quantity, setQuantity] = useState(1);
  const { addToCart, wishlist, toggleWishlist } = useApp();

  if (!product) return <div className="p-20 text-center uppercase text-[10px] font-black">Product not found</div>;

  const isWishlisted = wishlist.includes(product.id);
  const recommendations = PRODUCTS.filter(p => p.id !== product.id).slice(0, 4);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24">
        {/* Gallery */}
        <div className="flex gap-4">
          <div className="hidden md:flex flex-col gap-4">
            {product.images.map((img, i) => (
              <button 
                key={i} 
                onClick={() => setCurrentImage(i)}
                className={cn(
                  "relative w-20 aspect-square border-2",
                  currentImage === i ? "border-foreground" : "border-transparent"
                )}
              >
                <Image src={img} fill alt={product.name} className="object-cover" />
              </button>
            ))}
          </div>
          <div className="relative flex-1 aspect-[4/5] border">
            <Image src={product.images[currentImage]} fill alt={product.name} className="object-cover" priority />
            <button 
              onClick={() => toggleWishlist(product.id)}
              className="absolute top-6 right-6 p-4 bg-white/50 backdrop-blur hover:bg-white transition-all"
            >
              <Heart className={cn("h-6 w-6", isWishlisted && "fill-primary text-primary")} />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-8">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">{product.category} Care</span>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mt-2 leading-none">{product.name}</h1>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mt-4">{product.tagline}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-foreground text-background px-3 py-1 text-xs font-black">
              {product.rating} <Star className="h-3 w-3 ml-2 fill-primary text-primary" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{product.reviewCount} Reviews</span>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="text-4xl font-black">₹{product.price.toLocaleString()}</span>
            {product.salePrice && (
              <span className="text-xl text-muted-foreground line-through italic">₹{product.salePrice.toLocaleString()}</span>
            )}
          </div>

          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest">Select Size</span>
            <div className="flex gap-4">
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

          <div className="flex gap-4">
            <div className="flex items-center border-2 border-foreground h-16">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-6 hover:bg-muted"><Minus className="h-4 w-4" /></button>
              <span className="px-6 font-black">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="px-6 hover:bg-muted"><Plus className="h-4 w-4" /></button>
            </div>
            <Button 
              className="flex-1 h-16 rounded-none bg-primary text-white font-black uppercase tracking-widest hover:bg-primary/90"
              onClick={() => addToCart(product, selectedSize)}
            >
              Add to Cart
            </Button>
          </div>

          <div className="pt-8">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="ingredients">
                <AccordionTrigger className="text-[10px] font-black uppercase tracking-widest">Key Ingredients</AccordionTrigger>
                <AccordionContent className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                  {product.ingredients.join(', ')}. Optimized for clinical results.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="how-to-use">
                <AccordionTrigger className="text-[10px] font-black uppercase tracking-widest">How to Use</AccordionTrigger>
                <AccordionContent className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                  Apply on cleansed face/body. Use SPF during the day.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Recommended */}
      <section className="py-24 border-t">
        <h2 className="text-2xl md:text-4xl font-black tracking-tighter uppercase mb-12">You May Also Like</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {recommendations.map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
