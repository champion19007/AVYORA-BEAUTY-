'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Top rated' },
  { key: 'newest', label: 'New arrivals' },
];

function CollectionsContent() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const concernFilter = searchParams.get('concern');
  const namedFilter = searchParams.get('filter');
  const query = searchParams.get('q');

  const [sort, setSort] = useState<SortKey>('featured');

  const filteredProducts = useMemo(() => {
    let result = [...PRODUCTS];

    if (categoryFilter) {
      result = result.filter(
        (p) => p.category === categoryFilter || p.id.includes(categoryFilter)
      );
    }

    if (concernFilter) {
      result = result.filter((p) => p.concerns.includes(concernFilter));
    }

    // The header links to ?filter=bestsellers; honour it rather than
    // silently returning the full catalogue.
    if (namedFilter === 'bestsellers') {
      result = result.filter((p) => p.isBestSeller);
    } else if (namedFilter === 'new') {
      result = result.filter((p) => p.isNewLaunch);
    }

    if (query) {
      const q = query.toLowerCase();
      result = result.filter((p) =>
        [p.name, p.tagline, p.description, ...p.ingredients, ...p.concerns]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    switch (sort) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        result.sort((a, b) => Number(b.isNewLaunch) - Number(a.isNewLaunch));
        break;
      default:
        break;
    }

    return result;
  }, [categoryFilter, concernFilter, namedFilter, query, sort]);

  // A readable page title for whichever filter is active.
  const heading = query
    ? `Results for “${query}”`
    : namedFilter === 'bestsellers'
      ? 'Best sellers'
      : namedFilter === 'new'
        ? 'New arrivals'
        : concernFilter
          ? (CONCERNS.find((c) => c.id === concernFilter)?.name ?? concernFilter.replace(/-/g, ' '))
          : categoryFilter
            ? (CATEGORIES.find((c) => c.id === categoryFilter)?.name ?? categoryFilter.replace(/-/g, ' '))
            : 'Shop all';

  return (
    <div className="container mx-auto px-4 py-16">
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <span className="eyebrow">Clinical catalogue</span>
        <h1 className="mt-3 font-headline text-4xl font-normal capitalize tracking-[0.02em] md:text-5xl">
          {heading}
        </h1>
        <span className="rule-gold mx-auto mt-8 max-w-xs" aria-hidden="true" />
        <p className="mt-8 text-base leading-relaxed text-muted-foreground">
          Our complete range of research-backed formulations, each synthesised in-house
          to target a specific concern with full ingredient transparency.
        </p>
      </header>

      <div className="mb-10 flex flex-col items-center justify-between gap-4 border-b border-border pb-5 sm:flex-row">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="space-y-6 py-32 text-center">
          <h2 className="font-headline text-3xl font-normal">Nothing here yet</h2>
          <p className="text-muted-foreground">
            We couldn&apos;t find any formulations matching your selection.
          </p>
          <Link href="/collections">
            <Button className="rounded-md px-10 py-6 text-xs font-semibold uppercase tracking-[0.2em]">
              View all formulations
            </Button>
          </Link>
        </div>
      )}

      <p className="mt-28 border-t border-border pt-12 text-center text-sm italic text-muted-foreground">
        Every Avyora product is made in small clinical batches for maximum active stability.
      </p>
    </div>
  );
}

/** Skeleton shown while the search params resolve on the client. */
function CollectionsFallback() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto mb-12 h-40 max-w-2xl animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={cn('aspect-[3/4] animate-pulse rounded-lg bg-muted')} />
        ))}
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsFallback />}>
      <CollectionsContent />
    </Suspense>
  );
}
