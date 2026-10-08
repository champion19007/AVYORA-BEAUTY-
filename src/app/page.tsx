import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { activeCategories, activeConcerns } from '@/lib/catalogue';
import { HomeClient } from './home-client';
import { REDESIGN } from '@/lib/redesign';
import { Hero } from '@/components/nv/home/hero';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';

export const revalidate = 60;

export default async function Home() {
  const [stock, prices] = await Promise.all([catalogueStock(), displayPrices()]);
  return (
    <>
    {REDESIGN && <Hero />}
    <HomeClient
      redesign={REDESIGN}
      // Same availability the listing uses, so a sold-out product does not
      // look buyable on the homepage and unavailable one click later.
      stock={stock}
      prices={prices}
      
      products={PRODUCTS} 
      categories={CATEGORIES} 
      concerns={CONCERNS}
      activeCategories={activeCategories()}
      activeConcerns={activeConcerns()}
    />
    </>
  );
}
