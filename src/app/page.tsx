import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { HomeClient } from './home-client';

export default function Home() {
  const activeCategories = new Set(PRODUCTS.map(p => p.category));
  const activeConcerns = new Set(PRODUCTS.flatMap(p => p.concerns));

  return (
    <HomeClient 
      products={PRODUCTS} 
      categories={CATEGORIES} 
      concerns={CONCERNS}
      activeCategories={activeCategories}
      activeConcerns={activeConcerns}
    />
  );
}
