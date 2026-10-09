import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PRODUCTS, type Product } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import { APPROVED_DIRECTIONS } from '@/data/product-directions';
import { FORMULATIONS } from '@/data/formulations';
import { db, isDatabaseConfigured } from '@/db';
import { latestFormulation } from '@/modules/ingredients/formulations';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { reviewAggregates } from '@/modules/reviews/reviews';
import { formatPaise } from '@/lib/money';
import { stockLabel } from '@/lib/stock-label';
import { unitPricePaise } from '@/lib/unit-price';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compare products', robots: { index: false, follow: true } };

const STEP: Record<string, string> = {
  cleanse: 'Cleanser',
  moisturise: 'Moisturiser',
  protect: 'Sunscreen',
  treatment: 'Treatment',
  optional: 'Optional addition',
  none: 'Not part of a face routine',
};

/**
 * Up to three products side by side, from verified data only: current
 * prices per size with a unit price in one unit (₹ per 10 ml, 10 g or item;
 * different units are not converted), counted stock, the routine step,
 * whether a full ingredient list and usage directions have been verified,
 * and genuine review aggregates. Highlights are labelled as highlights, never
 * as a full formulation.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = '' } = await searchParams;
  const chosen = [...new Set(ids.split(','))]
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .slice(0, 3);
  const [prices, stock, reviews] = await Promise.all([
    displayPrices(),
    catalogueStock(),
    isDatabaseConfigured() ? reviewAggregates(db).catch(() => ({})) : Promise.resolve({} as Awaited<ReturnType<typeof reviewAggregates>>),
  ]);

  if (chosen.length < 2) {
    return (
      <main className="container mx-auto max-w-3xl py-20">
        <h1 className="text-4xl font-medium tracking-tight">Compare products</h1>
        <p className="mt-4 text-[15px] text-muted-foreground">Choose two or three products in the shop to compare them here.</p>
        <Link href="/collections" className="mt-6 inline-block underline">
          Go to the shop
        </Link>
      </main>
    );
  }

  const units = new Set(
    chosen.flatMap((p) => p.sizes.map((s) => unitPricePaise(prices[`${p.id}::${s.label}`]?.price ?? s.price * 100, s.label)?.per ?? 'unknown'))
  );
  const rows: { label: string; cell: (p: Product) => React.ReactNode }[] = [
    { label: 'Routine step', cell: (p) => STEP[ROUTINE_ROLES[p.id] ?? 'none'] },
    {
      label: 'Sizes and current prices',
      cell: (p) => (
        <ul className="space-y-1">
          {p.sizes.map((s) => {
            const price = prices[`${p.id}::${s.label}`]?.price ?? s.price * 100;
            const unit = unitPricePaise(price, s.label);
            const avail = stockLabel(stock[`${p.id}::${s.label}`]);
            return (
              <li key={s.label}>
                {s.label}: <span className="font-medium">{formatPaise(price)}</span>
                {unit && <span className="text-muted-foreground"> ({formatPaise(unit.paise)} per {unit.per})</span>}
                <span className={avail.tone === 'out' ? ' text-destructive' : ' text-muted-foreground'}> · {avail.label}</span>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      label: 'Full ingredient list',
      cell: (p) => {
        const f = latestFormulation(p.id, FORMULATIONS);
        return f?.coverage === 'complete' ? (
          <span>Verified ({f.ingredients.length} ingredients)</span>
        ) : (
          <span className="text-muted-foreground">Not yet verified</span>
        );
      },
    },
    {
      label: 'Ingredient highlights',
      cell: (p) => (
        <span>
          {p.ingredients.join(', ') || '—'}
          <span className="block text-xs text-muted-foreground">Highlights from the product listing, not a full list.</span>
        </span>
      ),
    },
    {
      label: 'Usage directions',
      cell: (p) =>
        APPROVED_DIRECTIONS[p.id] ? <span>{APPROVED_DIRECTIONS[p.id].frequency}</span> : <span className="text-muted-foreground">Pending review; follow the pack</span>,
    },
    {
      label: 'Reviews',
      cell: (p) => {
        const r = (reviews as Record<string, { count: number; average: number }>)[p.id];
        return r ? `${r.average} out of 5 from ${r.count} verified ${r.count === 1 ? 'purchase' : 'purchases'}` : <span className="text-muted-foreground">No reviews yet</span>;
      },
    },
  ];

  return (
    <main className="container mx-auto py-16">
      <Link href={`/collections?compare=${chosen.map((p) => p.id).join(',')}`} className="text-sm text-muted-foreground underline">
        Back to the shop
      </Link>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">Compare products</h1>
      {units.size > 1 && (
        <p className="mt-3 text-sm text-muted-foreground">These products are sold in different units, so unit prices are only comparable within the same unit.</p>
      )}
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
          <caption className="sr-only">Comparison of {chosen.map((p) => p.name).join(', ')}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-48 p-3 align-bottom text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Product
              </th>
              {chosen.map((p) => (
                <th key={p.id} scope="col" className="p-3 align-bottom">
                  <div className="relative mb-3 aspect-[4/5] w-40 overflow-hidden rounded-xl bg-muted">
                    <Image src={p.images[0]} alt={p.name} fill sizes="160px" className="object-cover" />
                  </div>
                  <Link href={`/products/${p.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border align-top">
                <th scope="row" className="p-3 text-sm font-medium">
                  {row.label}
                </th>
                {chosen.map((p) => (
                  <td key={p.id} className="p-3">
                    {row.cell(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
