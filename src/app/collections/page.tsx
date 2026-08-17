'use client';

import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function CollectionsPage() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get('category') || searchParams.get('cat');
  const concernFilter = searchParams.get('concern');
  const typeFilter = searchParams.get('filter');

  const filteredProducts = PRODUCTS.filter(p => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (concernFilter && !p.concerns.includes(concernFilter)) return false;
    if (typeFilter === 'bestsellers' && !p.isBestSeller) return false;
    return true;
  });

  const activeConcerns = new Set();
  PRODUCTS.forEach(p => p.concerns.forEach(c => activeConcerns.add(c)));

  const activeCategories = new Set();
  PRODUCTS.forEach(p => activeCategories.add(p.category));

  return (
    <div className="container mx-auto px-4 py-12">
      <section className="mb-20">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {categoryFilter ? `${categoryFilter} Care` : concernFilter ? CONCERNS.find(c => c.id === concernFilter)?.name : typeFilter === 'bestsellers' ? 'Our Best Sellers' : 'Shop All Products'}
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {CATEGORIES.map(cat => {
            const isComingSoon = !activeCategories.has(cat.id);
            return (
              <div 
                key={cat.id} 
                className={cn(
                  "relative aspect-video group overflow-hidden border-2 transition-all",
                  categoryFilter === cat.id ? "border-primary" : "border-transparent",
                  isComingSoon && "opacity-60 cursor-not-allowed"
                )}
              >
                {isComingSoon ? (
                  <>
                    <Image src={cat.image} alt={cat.name} fill className="object-cover grayscale" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-[10px] font-black uppercase tracking-widest">{cat.name}</span>
                    </div>
                    <div className="absolute top-2 right-2 bg-primary text-white text-[8px] font-black uppercase px-2 py-1 tracking-widest">Soon</div>
                  </>
                ) : (
                  <Link href={`/collections?category=${cat.id}`}>
                    <Image src={cat.image} alt={cat.name} fill className="object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-[10px] font-black uppercase tracking-widest">{cat.name}</span>
                    </div>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="flex flex-wrap gap-2 mb-16">
          {CONCERNS.map(c => {
            const isComingSoon = !activeConcerns.has(c.id);
            return (
              <Link 
                key={c.id} 
                href={isComingSoon ? '#' : `/collections?concern=${c.id}`}
                className={cn(isComingSoon && "cursor-default")}
                onClick={(e) => isComingSoon && e.preventDefault()}
              >
                <Button 
                  variant="outline" 
                  className={cn(
                    "rounded-none text-[8px] font-black uppercase tracking-widest h-8 px-4 relative flex items-center gap-2",
                    concernFilter === c.id ? "bg-foreground text-background" : "",
                    isComingSoon && "opacity-50"
                  )}
                >
                  {c.name}
                  {isComingSoon && (
                    <Badge variant="secondary" className="h-4 px-1 text-[6px] font-black tracking-tighter bg-primary/20 text-primary border-none">SOON</Badge>
                  )}
                </Button>
              </Link>
            );
          })}
          <Link href="/collections" className="ml-auto">
            <Button variant="ghost" className="text-[8px] font-black uppercase tracking-widest h-8">Clear Filters</Button>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-16">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))
        ) : (
          <div className="col-span-full py-20 text-center animate-in fade-in duration-700">
            <h3 className="text-lg font-black uppercase tracking-widest mb-4">More products coming soon</h3>
            <p className="text-muted-foreground uppercase tracking-[0.2em] text-[10px] font-bold max-w-md mx-auto leading-relaxed">
              We are currently formulating science-backed solutions for this concern. Check back shortly for our clinical results.
            </p>
            <Link href="/collections" className="inline-block mt-8">
              <Button className="rounded-none bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-8 py-6">
                Back to Shop All
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
