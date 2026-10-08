'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard, type StockByKey } from '@/components/product/product-card';
import type { DisplayPrices } from '@/modules/catalog/storefront-data';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { InMemoryCatalogSearch } from '@/modules/search/catalog-search';

/*
 * Built once per page load. The catalogue ships with the page, so search runs
 * here in the browser with the same ranking the server would use.
 */
const catalogSearch = new InMemoryCatalogSearch(
  PRODUCTS,
  Object.fromEntries(CONCERNS.map((c) => [c.id, c.name]))
);

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Top rated' },
  { key: 'newest', label: 'New arrivals' },
];

type Filters = { category: string | null; concern: string | null; filter: string | null; q: string | null };
const NO_FILTERS: Filters = { category: null, concern: null, filter: null, q: null };

/** Reads the URL's filters; only rendered in the browser, inside Suspense. */
function CollectionsFromUrl({ stock, prices }: { stock: StockByKey; prices: DisplayPrices }) {
  const searchParams = useSearchParams();
  const filters: Filters = {
    category: searchParams.get('category'),
    concern: searchParams.get('concern'),
    filter: searchParams.get('filter'),
    q: searchParams.get('q'),
  };
  return <CollectionsContent stock={stock} prices={prices} filters={filters} />;
}

function CollectionsContent({ stock, prices, filters }: { stock: StockByKey; prices: DisplayPrices; filters: Filters }) {
  const categoryFilter = filters.category;
  const concernFilter = filters.concern;
  const namedFilter = filters.filter;
  const query = filters.q;

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
      // Ranked: best match first, unless the shopper picks another order.
      const rank = new Map(catalogSearch.search(query).map((hit, i) => [hit.productId, i]));
      result = result
        .filter((p) => rank.has(p.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }

    /*
     * Sort by the price the card shows — offers included — not the catalogue
     * list price. Sorting by the latter put a product on offer in the wrong
     * place next to the very number it was sorted by.
     */
    const shownPrice = (p: (typeof result)[number]) =>
      prices[`${p.id}::${p.sizes[0]?.label}`]?.price ?? p.price * 100;

    switch (sort) {
      case 'price-asc':
        result.sort((a, b) => shownPrice(a) - shownPrice(b));
        break;
      case 'price-desc':
        result.sort((a, b) => shownPrice(b) - shownPrice(a));
        break;
      case 'rating':
        result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'newest':
        result.sort((a, b) => Number(b.isNewLaunch) - Number(a.isNewLaunch));
        break;
      default:
        break;
    }

    return result;
  }, [categoryFilter, concernFilter, namedFilter, query, sort, prices]);

  // A readable page title for whichever filter is active.
  const heading = query
    ? `Results for “${query}”`
    : namedFilter === 'bestsellers'
      ? 'Our picks'
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
        <span className="eyebrow">The range</span>
        <h1 className="mt-3 font-headline text-5xl font-normal capitalize tracking-tight md:text-6xl">
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
            <ProductCard key={product.id} product={product} stock={stock} prices={prices} />
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

    </div>
  );
}

export function CollectionsClient({ stock, prices }: { stock: StockByKey; prices: DisplayPrices }) {
  return (
    /*
     * The fallback is the full, unfiltered grid, not a skeleton. A static page
     * that reads the query string renders only its Suspense fallback on the
     * server, so with a skeleton here the HTML held no products at all: a
     * crawler, or a visitor before the JavaScript loaded, saw an empty shop.
     * Filters from the URL apply once the browser has them.
     */
    <Suspense fallback={<CollectionsContent stock={stock} prices={prices} filters={NO_FILTERS} />}>
      <CollectionsFromUrl stock={stock} prices={prices} />
    </Suspense>
  );
}
