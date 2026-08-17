'use client';

import { PRODUCTS, CATEGORIES } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function CollectionsPage() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get('category') || searchParams.get('cat');
  const concernFilter = searchParams.get('concern');
  const typeFilter = searchParams.get('filter');

  const filteredProducts = PRODUCTS.filter(p => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (concernFilter && !p.concerns.includes(concernFilter)) return false;
    if (typeFilter === 'bestsellers' && !p.isBestSeller) return false;
    if (typeFilter === 'new' && !p.isNewLaunch) return false;
    return true;
  });

  return (
    <div className="container mx-auto px-4 py-12">
      <section className="mb-20">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-12">
          {categoryFilter ? `${categoryFilter} Care` : concernFilter ? `Target: ${concernFilter}` : typeFilter === 'bestsellers' ? 'Our Best Sellers' : 'Shop All Collections'}
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {CATEGORIES.map(cat => (
            <Link 
              key={cat.id} 
              href={`/collections?category=${cat.id}`}
              className={cn(
                "relative aspect-video group overflow-hidden border-2 transition-all",
                categoryFilter === cat.id ? "border-primary" : "border-transparent"
              )}
            >
              <Image src={cat.image} alt={cat.name} fill className="object-cover grayscale group-hover:grayscale-0" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white text-[10px] font-black uppercase tracking-widest">{cat.name}</span>
              </div>
            </Link>
          ))}
        </div>
        
        <div className="flex flex-wrap gap-2 mb-16">
          {['Acne', 'Aging', 'Pigmentation', 'Dryness', 'Oiliness'].map(c => (
            <Link key={c} href={`/collections?concern=${c.toLowerCase()}`}>
              <Button 
                variant="outline" 
                className={cn(
                  "rounded-none text-[8px] font-black uppercase tracking-widest h-8 px-4",
                  concernFilter === c.toLowerCase() ? "bg-foreground text-background" : ""
                )}
              >
                {c}
              </Button>
            </Link>
          ))}
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
          <div className="col-span-full py-20 text-center">
            <p className="text-muted-foreground uppercase tracking-widest text-[10px] font-black">No products found for this selection.</p>
          </div>
        )}
      </div>
    </div>
  );
}
