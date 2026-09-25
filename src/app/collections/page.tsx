import type { Metadata } from 'next';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { CollectionsClient } from './collections-client';

export const metadata: Metadata = {
  title: 'All products',
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

export default async function CollectionsPage() {
  const [stock, prices] = await Promise.all([catalogueStock(), displayPrices()]);
  return <CollectionsClient stock={stock} prices={prices} />;
}
