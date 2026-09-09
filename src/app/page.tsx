import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { activeCategories, activeConcerns } from '@/lib/catalogue';
import { HomeClient } from './home-client';
import { stockForCatalogue } from '@/lib/catalogue-stock';

export const revalidate = 60;

export default async function Home() {
  return (
    <HomeClient
      // Same availability the listing uses, so a sold-out product does not
      // look buyable on the homepage and unavailable one click later.
      stock={await stockForCatalogue()}
      
      products={PRODUCTS} 
      categories={CATEGORIES} 
      concerns={CONCERNS}
      activeCategories={activeCategories()}
      activeConcerns={activeConcerns()}
    />
  );
}
