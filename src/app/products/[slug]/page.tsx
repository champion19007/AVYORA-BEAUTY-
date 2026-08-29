import { PRODUCTS } from '@/data/mock-data';
import { getProductBySlug } from '@/lib/catalogue';
import { notFound } from 'next/navigation';
import { ProductClient } from './product-client';
import type { Metadata, ResolvingMetadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

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
      <ProductClient product={product} recommendations={recommendations} />
    </>
  );
}
