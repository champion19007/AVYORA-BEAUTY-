import { PRODUCTS } from '@/data/mock-data';
import { getProductBySlug } from '@/lib/catalogue';
import { getStockMap } from '@/lib/inventory';
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
  const stock = await getStockMap([product.id]);
  const stockBySize: Record<string, number> = {};
  for (const size of product.sizes) {
    const quantity = stock.get(`${product.id}::${size.label}`);
    // Infinity is the backorder case; the badge should read as available.
    stockBySize[size.label] = quantity === Infinity ? Number.MAX_SAFE_INTEGER : (quantity ?? 0);
  }

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
      lowPrice: product.price,
      highPrice: product.sizes[product.sizes.length - 1].price,
      offerCount: product.sizes.length,
      availability: 'https://schema.org/InStock',
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
      />
    </>
  );
}
