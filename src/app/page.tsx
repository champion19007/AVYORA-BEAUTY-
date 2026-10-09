import type { Metadata } from 'next';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { activeCategories, activeConcerns } from '@/lib/catalogue';
import { HomeClient } from './home-client';
import { REDESIGN } from '@/lib/redesign';
import { Hero } from '@/components/nv/home/hero';
import { About, Consultation, Faq, Features, ImageBreak, Pricing, Results, Services, Testimonials, Vision } from '@/components/nv/home/landing';
import { essentialSteps, featuredProducts, publishedReview } from '@/components/nv/home/data';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';

export const revalidate = 60;
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default async function Home() {
  const [stock, prices] = await Promise.all([catalogueStock(), displayPrices()]);

  /*
   * Redesign (NEXT_PUBLIC_REDESIGN=1): the Nuvē-reference landing page. The
   * old homepage's content has moved, not gone: the full product grid,
   * categories and concerns are on /collections (with the same filters),
   * and the "Build your routine" panel became the Pricing section here.
   */
  if (REDESIGN) {
    return (
      <>
        <Hero />
        <About />
        <Results products={featuredProducts(prices, stock)} />
        <Vision />
        <Features />
        <Services />
        <Testimonials review={await publishedReview()} />
        <Pricing steps={essentialSteps(prices, stock)} />
        <ImageBreak />
        <Faq />
        <Consultation />
      </>
    );
  }

  return (
    <HomeClient
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
  );
}
