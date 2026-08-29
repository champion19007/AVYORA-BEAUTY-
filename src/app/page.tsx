import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { activeCategories, activeConcerns } from '@/lib/catalogue';
import { HomeClient } from './home-client';

export default function Home() {
  return (
    <HomeClient 
      products={PRODUCTS} 
      categories={CATEGORIES} 
      concerns={CONCERNS}
      activeCategories={activeCategories()}
      activeConcerns={activeConcerns()}
    />
  );
}
