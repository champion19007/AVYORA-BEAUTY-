
'use client';

import { useMemo } from 'react';
import { PRODUCTS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { useSearchParams } from 'next/navigation';

export default function CollectionsPage() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const concernFilter = searchParams.get('concern');

  const filteredProducts = useMemo(() => {
    let result = [...PRODUCTS];

    if (categoryFilter) {
      result = result.filter(p => p.category === categoryFilter || p.id.includes(categoryFilter));
    }

    if (concernFilter) {
      result = result.filter(p => p.concerns.includes(concernFilter));
    }

    return result;
  }, [categoryFilter, concernFilter]);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-20 text-center space-y-6">
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Clinical Catalog</span>
          <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none">
            {categoryFilter ? categoryFilter.replace(/-/g, ' ') : 'Shop All'}
          </h1>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Explore our complete range of research-backed clinical formulations. 
          Each product is synthesized in-house to target specific dermal concerns with maximum efficacy and transparency.
        </p>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-16">
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="py-40 text-center space-y-8">
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase tracking-widest">No products found</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              We couldn't find any formulations matching your selection.
            </p>
          </div>
          <a href="/collections" className="inline-block bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-10 py-6 hover:bg-primary transition-colors">
            View All Formulations
          </a>
        </div>
      )}

      <div className="mt-40 pt-20 border-t border-foreground/10 text-center">
        <p className="text-[8px] font-black uppercase tracking-[0.5em] text-muted-foreground italic">
          All Avyora products are manufactured in clinical small-batches for maximum active stability.
        </p>
      </div>
    </div>
  );
}
