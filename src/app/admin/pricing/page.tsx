import type { Metadata } from 'next';
import { isDatabaseConfigured } from '@/db';
import { allProducts } from '@/lib/catalogue';
import { pricingMap, resolvePrice } from '@/lib/pricing';
import { PriceRow } from './price-row';
import { PromotionBuilder } from '@/components/admin/promotion-builder';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

/**
 * Prices and offers.
 *
 * The catalogue file supplies the starting price for every SKU; saving a row
 * here creates an override that wins from then on. Nothing is deleted when an
 * offer ends — the normal price is kept alongside the sale price, so ending an
 * offer is clearing one field rather than remembering what the price used to
 * be.
 *
 * Owner-only. The stockroom console has no route to this page and the action
 * refuses a manager session outright, because a price is a commercial decision
 * rather than a stock one.
 */
export default async function AdminPricingPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const overrides = await pricingMap();

  const rows = allProducts().flatMap((product) =>
    product.sizes.map((size) => {
      const override = overrides.get(`${product.id}::${size.label}`);
      // The catalogue stores rupees; the override stores paise.
      const effective = resolvePrice(size.price * 100, override);

      return {
        productId: product.id,
        productName: product.name,
        size: size.label,
        cataloguePrice: size.price,
        price: (override?.price ?? size.price * 100) / 100,
        salePrice: override?.salePrice ? override.salePrice / 100 : null,
        offerLabel: override?.offerLabel ?? null,
        offerEndsAt: override?.offerEndsAt ? override.offerEndsAt.toISOString().slice(0, 10) : null,
        overridden: effective.overridden,
        // The version this form edits. 0 means no override exists yet.
        version: override?.version ?? 0,
      };
    })
  );

  const liveOffers = rows.filter((r) => r.salePrice !== null).length;

  return (
    <div>
      <h1 className="font-headline text-3xl font-normal tracking-tight">Pricing &amp; offers</h1>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
        Prepare category promotions or manage individual product prices below.
      </p>

      <div className="mt-7">
        <PromotionBuilder
          categories={[...new Set(allProducts().map((product) => product.category))].map((id) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
          }))}
        />
      </div>

      <h2 className="mt-10 font-headline text-2xl">Individual product prices</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter amounts in rupees. An offer price must be below the normal price; leaving it blank ends the offer. Saving
        a row updates that product’s live price. Promotion JSON above is a separate draft.
        {liveOffers > 0 && ` ${liveOffers} product offer${liveOffers === 1 ? '' : 's'} configured.`}
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card">
        {rows.map((row) => (
          <PriceRow key={`${row.productId}-${row.size}`} {...row} />
        ))}
      </div>
    </div>
  );
}
