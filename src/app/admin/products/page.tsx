import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { db, isDatabaseConfigured } from '@/db';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { CATALOGUE_MODE, PUBLISHED_CATALOGUE } from '@/lib/catalogue-mode';
import { PRODUCTS } from '@/data/mock-data';
import { loadActiveRelease } from '@/modules/knowledge/releases';
import {
  LAUNCH_DRAFTS,
  listEditableProducts,
  publishRecord,
  type EditableProduct,
  type ProductStatus,
} from '@/modules/catalog/product-store';
import { setUpLaunchAction } from './actions';
import { PublishPanel } from './publish-panel';

export const metadata: Metadata = { title: 'Products' };
export const dynamic = 'force-dynamic';

const STATUS: Record<ProductStatus, { title: string; hint: string }> = {
  live: { title: 'On the shop', hint: 'Customers can see and buy these.' },
  draft: { title: 'Drafts', hint: 'Being written. Not on the shop.' },
  hidden: { title: 'Hidden', hint: 'Kept for later and for past orders. Switch one to Live to bring it back.' },
};

function priceRange(p: EditableProduct): string {
  if (p.sizes.length === 0) return 'No sizes yet';
  const prices = p.sizes.map((s) => s.pricePaise);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? formatPaise(lo) : `${formatPaise(lo)} – ${formatPaise(hi)}`;
}

function ProductRow({ p }: { p: EditableProduct }) {
  const missingCost = p.sizes.some((s) => s.costPaise === null);
  const stock = p.sizes.reduce((n, s) => n + (s.stock ?? 0), 0);
  return (
    <li>
      <Link
        href={`/admin/products/${p.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1 font-medium">{p.name}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{priceRange(p)}</span>
        <span className="w-24 text-sm tabular-nums text-muted-foreground">{stock} in stock</span>
        {missingCost && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">No cost price</span>
        )}
        {p.images.length === 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">No photo</span>
        )}
      </Link>
    </li>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!isDatabaseConfigured()) {
    return <p className="text-[15px] text-muted-foreground">No database is configured on this deployment.</p>;
  }
  const { q } = await searchParams;
  const [all, published, release] = await Promise.all([
    listEditableProducts(db),
    publishRecord(db),
    loadActiveRelease(db).catch(() => null),
  ]);
  // Products on the shop that the routine finder's knowledge release does not know yet.
  const inRelease = new Set(
    ((release?.artifacts.catalogue as { products?: { id: string }[] } | undefined)?.products ?? []).map((p) => p.id)
  );
  const notInFinder = PRODUCTS.filter((p) => !inRelease.has(p.id));
  const query = (q ?? '').trim().toLowerCase();
  const products = query ? all.filter((p) => p.name.toLowerCase().includes(query)) : all;
  const needsLaunchSetup = !LAUNCH_DRAFTS.every((d) => all.some((p) => p.id === d.id));
  const publishedAt = published ? new Date(published.requestedAt) : null;
  const unpublished = publishedAt ? all.filter((p) => p.updatedAt > publishedAt).length : all.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-normal tracking-tight">Products</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            Add and edit products here. Prices, stock and offers change on the shop straight away; new products, text
            and photos appear after you press Publish.
          </p>
        </div>
        <Link href="/admin/products/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add product
          </Button>
        </Link>
      </div>

      {needsLaunchSetup && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-medium">Set up your launch range</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Creates the six launch drafts ({LAUNCH_DRAFTS.map((d) => d.name).join(', ')}) for you to fill in, and hides
            the {all.length} sample products. Hidden products are kept and can be switched back on. Nothing changes on
            the shop until you publish.
          </p>
          <form action={setUpLaunchAction} className="mt-4">
            <Button type="submit">Set up launch range</Button>
          </form>
        </section>
      )}

      {release && notInFinder.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm">
          <h2 className="font-medium text-amber-950">Update the routine finder</h2>
          <p className="mt-1 max-w-2xl text-amber-900">
            {notInFinder.map((p) => p.name).join(', ')} {notInFinder.length === 1 ? 'is' : 'are'} on the shop but not
            yet recommended by the routine finder. After a publish has finished, open{' '}
            <Link href="/admin/knowledge" className="underline underline-offset-2">
              Ingredient knowledge
            </Link>{' '}
            and publish a new release.
          </p>
        </section>
      )}

      <PublishPanel
        publishedAt={publishedAt?.toISOString() ?? null}
        unpublished={unpublished}
        liveCount={all.filter((p) => p.status === 'live').length}
        draftCount={all.filter((p) => p.status === 'draft').length}
        showingSamples={CATALOGUE_MODE === 'sample' && !PUBLISHED_CATALOGUE}
      />

      <form className="max-w-sm">
        <label className="sr-only" htmlFor="product-search">
          Search products
        </label>
        <input
          id="product-search"
          name="q"
          defaultValue={q}
          placeholder="Search products"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
        />
      </form>

      {(['live', 'draft', 'hidden'] as const).map((status) => {
        const list = products.filter((p) => p.status === status);
        return (
          <section key={status} aria-labelledby={`${status}-heading`}>
            <h2 id={`${status}-heading`} className="text-lg font-medium">
              {STATUS[status].title} <span className="text-muted-foreground">({list.length})</span>
            </h2>
            <p className="text-sm text-muted-foreground">{STATUS[status].hint}</p>
            {list.length > 0 && (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
                {list.map((p) => (
                  <ProductRow key={p.id} p={p} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
