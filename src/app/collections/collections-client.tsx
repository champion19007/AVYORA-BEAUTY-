'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard, type StockByKey } from '@/components/product/product-card';
import type { DisplayPrices } from '@/modules/catalog/storefront-data';
import type { ReviewAggregate } from '@/modules/reviews/reviews';
import { Button } from '@/components/ui/button';
import { InMemoryCatalogSearch } from '@/modules/search/catalog-search';
import { activeCategories, activeConcerns } from '@/lib/catalogue';

/*
 * Built once per page load. The catalogue ships with the page, so search runs
 * here in the browser with the same ranking the server would use.
 */
const catalogSearch = new InMemoryCatalogSearch(
  PRODUCTS,
  Object.fromEntries(CONCERNS.map((c) => [c.id, c.name]))
);

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Top rated',
  newest: 'New arrivals',
};

/** Only categories and concerns that currently have products are offered. */
const CATEGORY_OPTIONS = CATEGORIES.filter((c) => activeCategories().has(c.id));
const CONCERN_OPTIONS = CONCERNS.filter((c) => activeConcerns().has(c.id));
const MAX_COMPARE = 3;

type Filters = { category: string | null; concern: string | null; filter: string | null; q: string | null; sort: SortKey; compare: string[] };
const NO_FILTERS: Filters = { category: null, concern: null, filter: null, q: null, sort: 'featured', compare: [] };
type Props = { stock: StockByKey; prices: DisplayPrices; reviews: Record<string, ReviewAggregate> };

/** Reads the URL's filters; only rendered in the browser, inside Suspense. */
function CollectionsFromUrl(props: Props) {
  const p = useSearchParams();
  const sort = p.get('sort') as SortKey | null;
  const filters: Filters = {
    category: p.get('category'),
    concern: p.get('concern'),
    filter: p.get('filter'),
    q: p.get('q'),
    sort: sort && sort in SORT_LABELS ? sort : 'featured',
    compare: (p.get('compare') ?? '').split(',').filter((id) => PRODUCTS.some((x) => x.id === id)).slice(0, MAX_COMPARE),
  };
  return <CollectionsContent {...props} filters={filters} />;
}

function CollectionsContent({ stock, prices, reviews, filters }: Props & { filters: Filters }) {
  const router = useRouter();
  const [draftQuery, setDraftQuery] = useState(filters.q ?? '');
  const hasRatings = Object.keys(reviews).length > 0;

  /** Every control writes the URL, so filtered views can be shared, reloaded and navigated with Back. */
  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.category) params.set('category', next.category);
    if (next.concern) params.set('concern', next.concern);
    if (next.filter) params.set('filter', next.filter);
    if (next.sort !== 'featured') params.set('sort', next.sort);
    if (next.compare.length) params.set('compare', next.compare.join(','));
    const qs = params.toString();
    router.replace(qs ? `/collections?${qs}` : '/collections', { scroll: false });
  };
  const activeCount = [filters.q, filters.category, filters.concern, filters.filter].filter(Boolean).length;

  const filteredProducts = useMemo(() => {
    let result = [...PRODUCTS];
    if (filters.category) result = result.filter((p) => p.category === filters.category || p.id.includes(filters.category!));
    if (filters.concern) result = result.filter((p) => p.concerns.includes(filters.concern!));
    // The header links to ?filter=bestsellers; honour it rather than silently returning the full catalogue.
    if (filters.filter === 'bestsellers') result = result.filter((p) => p.isBestSeller);
    else if (filters.filter === 'new') result = result.filter((p) => p.isNewLaunch);
    if (filters.q) {
      // Ranked: best match first, unless the shopper picks another order.
      const rank = new Map(catalogSearch.search(filters.q).map((hit, i) => [hit.productId, i]));
      result = result.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }
    // Sort by the price the card shows, offers included, not the catalogue list price.
    const shownPrice = (p: (typeof result)[number]) => prices[`${p.id}::${p.sizes[0]?.label}`]?.price ?? p.price * 100;
    switch (filters.sort) {
      case 'price-asc':
        result.sort((a, b) => shownPrice(a) - shownPrice(b));
        break;
      case 'price-desc':
        result.sort((a, b) => shownPrice(b) - shownPrice(a));
        break;
      case 'rating':
        // Published reviews only; unrated products follow, in their existing order.
        result.sort((a, b) => (reviews[b.id]?.average ?? -1) - (reviews[a.id]?.average ?? -1) || (reviews[b.id]?.count ?? 0) - (reviews[a.id]?.count ?? 0));
        break;
      case 'newest':
        result.sort((a, b) => Number(b.isNewLaunch) - Number(a.isNewLaunch));
        break;
    }
    return result;
  }, [filters, prices, reviews]);

  const heading = filters.q
    ? `Results for “${filters.q}”`
    : filters.filter === 'bestsellers'
      ? 'Our picks'
      : filters.filter === 'new'
        ? 'New arrivals'
        : filters.concern
          ? (CONCERNS.find((c) => c.id === filters.concern)?.name ?? filters.concern.replace(/-/g, ' '))
          : filters.category
            ? (CATEGORIES.find((c) => c.id === filters.category)?.name ?? filters.category.replace(/-/g, ' '))
            : 'Shop all';

  const toggleCompare = (id: string) =>
    update({ compare: filters.compare.includes(id) ? filters.compare.filter((x) => x !== id) : [...filters.compare, id].slice(0, MAX_COMPARE) });

  return (
    <div className="container mx-auto px-4 py-16">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <span className="eyebrow">The range</span>
        <h1 className="mt-3 font-headline text-5xl font-normal capitalize tracking-tight md:text-6xl">{heading}</h1>
        <span className="rule-gold mx-auto mt-8 max-w-xs" aria-hidden="true" />
        <p className="mt-8 text-base leading-relaxed text-muted-foreground">Every product in the range, with current prices and stock.</p>
      </header>

      <section aria-label="Search and filters" className="mb-8 space-y-4 border-b border-border pb-6">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: draftQuery.trim() || null });
          }}
        >
          <label htmlFor="catalogue-search" className="sr-only">
            Search products, ingredients or concerns
          </label>
          <input
            id="catalogue-search"
            type="search"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Search products, ingredients or concerns"
            className="h-11 flex-1 rounded-full border border-border bg-background px-5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <Button type="submit" className="h-11 rounded-full px-6">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-category" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Category
            </label>
            <select
              id="filter-category"
              value={filters.category ?? ''}
              onChange={(e) => update({ category: e.target.value || null })}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-concern" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Concern
            </label>
            <select
              id="filter-concern"
              value={filters.concern ?? ''}
              onChange={(e) => update({ concern: e.target.value || null })}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All concerns</option>
              {CONCERN_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sort" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Sort
            </label>
            <select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortKey })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              {(Object.keys(SORT_LABELS) as SortKey[])
                // "Top rated" only once genuine published reviews exist.
                .filter((k) => k !== 'rating' || hasRatings)
                .map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
            </select>
          </div>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              className="h-10 gap-1 rounded-full"
              onClick={() => {
                setDraftQuery('');
                update({ q: null, category: null, concern: null, filter: null });
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Clear all filters
            </Button>
          )}
          <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
          </p>
        </div>
      </section>

      <h2 className="sr-only">Products</h2>
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              stock={stock}
              prices={prices}
              reviews={reviews[product.id]}
              compare={{ selected: filters.compare.includes(product.id), disabled: filters.compare.length >= MAX_COMPARE, onToggle: () => toggleCompare(product.id) }}
            />
          ))}
        </div>
      ) : PRODUCTS.length === 0 ? (
        <div className="space-y-4 py-32 text-center">
          <h2 className="font-headline text-3xl font-normal">Our range is being prepared</h2>
          <p className="text-muted-foreground">Products appear here once their formulations, prices and stock are verified.</p>
          <Link href="/routine-finder" className="underline">
            Explore the routine finder meanwhile
          </Link>
        </div>
      ) : (
        <div className="space-y-6 py-24 text-center">
          <h2 className="font-headline text-3xl font-normal">No products match</h2>
          <p className="text-muted-foreground">
            {filters.q ? `Nothing matched “${filters.q}”. Try an ingredient (such as niacinamide), a concern or a product type.` : 'No product has every filter you chose.'}
          </p>
          <Button
            className="rounded-full px-8"
            onClick={() => {
              setDraftQuery('');
              update({ q: null, category: null, concern: null, filter: null });
            }}
          >
            Clear all filters
          </Button>
        </div>
      )}

      {filters.compare.length > 0 && (
        <aside aria-label="Compare products" className="sticky bottom-4 z-20 mx-auto mt-10 flex max-w-3xl items-center justify-between gap-4 rounded-full border border-border bg-background px-6 py-3 shadow-lg">
          <p className="text-sm">
            {filters.compare.length} of {MAX_COMPARE} selected to compare
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-full" onClick={() => update({ compare: [] })}>
              Clear
            </Button>
            <Button asChild className="rounded-full" disabled={filters.compare.length < 2}>
              <Link href={`/compare?ids=${filters.compare.join(',')}`} aria-disabled={filters.compare.length < 2}>
                Compare {filters.compare.length < 2 ? '(choose 2 or 3)' : ''}
              </Link>
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}

export function CollectionsClient(props: Props) {
  return (
    /*
     * The fallback is the full, unfiltered grid, not a skeleton: a static page
     * that reads the query string renders only its Suspense fallback on the
     * server, and crawlers and pre-JavaScript visitors must still see products.
     */
    <Suspense fallback={<CollectionsContent {...props} filters={NO_FILTERS} />}>
      <CollectionsFromUrl {...props} />
    </Suspense>
  );
}
