import { PRODUCTS } from '@/data/mock-data';
import { getProductBySlug } from '@/lib/catalogue';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { skuKey, type SkuPrice } from '@/modules/catalog/sku-price';
import { notFound } from 'next/navigation';
import { ProductClient } from './product-client';
import type { Metadata, ResolvingMetadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Stock changes, the catalogue does not.
 *
 * The page stays statically generated — a storefront should not give up static
 * rendering for a badge — but revalidates every minute so availability is at
 * most a minute stale. That is the right trade because the badge is guidance,
 * not the guarantee: `reserveStock` decides at checkout, atomically, and a
 * customer who adds the last unit during that minute is refused there rather
 * than being oversold.
 */
export const revalidate = 60;

/**
 * The catalogue is fixed at build time, so every product detail page can be
 * statically pre-rendered rather than server-rendered on each request.
 */
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) return { title: 'Product Not Found' };

  return {
    title: product.name,
    description: product.tagline,
    openGraph: {
      title: `${product.name} | Avyora`,
      description: product.tagline,
      images: [product.images[0]],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const recommendations = PRODUCTS.filter((p) => p.id !== product.id).slice(0, 4);

  /*
   * Availability per size, keyed by label.
   *
   * A size with no inventory row is absent from the map, and the client treats
   * absent as out of stock — matching `reserveStock`, which now refuses an
   * uncounted SKU. Promising "In stock" over a checkout that then declines is
   * worse than saying so up front.
   */
  const [stock, prices] = await Promise.all([catalogueStock(), displayPrices()]);
  const stockBySize: Record<string, number> = {};
  const pricesBySize: Record<string, SkuPrice> = {};
  for (const size of product.sizes) {
    const key = skuKey(product.id, size.label);
    stockBySize[size.label] = stock[key] ?? 0;
    pricesBySize[size.label] = prices[key];
  }

  /*
   * Search engines are told the same prices and availability a shopper sees.
   * This used to advertise the catalogue's prices and a hard-coded "InStock",
   * so a sold-out product still appeared in results as available.
   */
  const shownPrices = Object.values(pricesBySize).map((p) => p.price / 100);
  const anyInStock = Object.values(stockBySize).some((q) => q > 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images,
    description: product.description,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: 'Avyora',
    },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: Math.min(...shownPrices),
      highPrice: Math.max(...shownPrices),
      offerCount: product.sizes.length,
      availability: anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `https://avyora.com/products/${product.slug}`,
    },
    // Only advertise an aggregateRating when real reviews back it. Emitting a
    // fabricated one breaches Google's structured-data policy and can get the
    // whole site's rich results demoted.
    ...(product.rating && product.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductClient
        product={product}
        recommendations={recommendations}
        stockBySize={stockBySize}
        pricesBySize={pricesBySize}
        catalogueStock={stock}
        cataloguePrices={prices}
      />
    </>
  );
}
