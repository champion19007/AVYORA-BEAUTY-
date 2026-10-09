import type { Metadata } from 'next';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { CollectionsClient } from './collections-client';
import { db, isDatabaseConfigured } from '@/db';
import { reviewAggregates } from '@/modules/reviews/reviews';

export const metadata: Metadata = {
  title: 'All products',
  // Search and filter variants (?q=, ?concern=) canonicalise to the unfiltered page.
  alternates: { canonical: '/collections' },
};

/**
 * The listing, as a server shell around the interactive grid.
 *
 * The page was entirely a client component, which meant it could not read
 * stock at all — so a sold-out product looked exactly like an available one in
 * every grid on the site, and a customer only discovered otherwise a click
 * later, or worse, at checkout after typing an address.
 *
 * Filtering and sorting stay in the browser where they belong; only the stock
 * read moves to the server.
 */
export const revalidate = 60;

/** Published-review aggregates; empty without a database or on failure, so the page still renders. */
const aggregates = () => (isDatabaseConfigured() ? reviewAggregates(db).catch(() => ({})) : Promise.resolve({}));

export default async function CollectionsPage() {
  const [stock, prices, reviews] = await Promise.all([catalogueStock(), displayPrices(), aggregates()]);
  return <CollectionsClient stock={stock} prices={prices} reviews={reviews} />;
}
