import { PRODUCTS } from '@/data/mock-data';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import { skuKey, type SkuPrice } from '@/modules/catalog/sku-price';
import { productCopy } from '@/modules/cms/content-read';
import { recommendationsFor } from '@/modules/recommendations/recommendations';
import { getProductById, getProductBySlug } from '@/lib/catalogue';
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
  const tagline = (await productCopy(slug))?.tagline ?? product.tagline;

  return {
    title: product.name,
    description: tagline,
    openGraph: {
      title: `${product.name} | Avyora`,
      description: tagline,
      images: [product.images[0]],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const catalogueProduct = getProductBySlug(slug);

  if (!catalogueProduct) {
    notFound();
  }

  /*
   * Published copy from the CMS replaces the catalogue's wording where it
   * exists. Only the words: names, sizes, prices and ingredients stay with
   * the catalogue and commerce tables, which are what checkout reads.
   */
  const copy = await productCopy(slug);
  const product = copy
    ? { ...catalogueProduct, tagline: copy.tagline, description: copy.description }
    : catalogueProduct;


  /*
   * Availability per size, keyed by label.
   *
   * A size with no inventory row is absent from the map, and the client treats
   * absent as out of stock — matching `reserveStock`, which now refuses an
   * uncounted SKU. Promising "In stock" over a checkout that then declines is
   * worse than saying so up front.
   */
  const [stock, prices] = await Promise.all([catalogueStock(), displayPrices()]);

  /*
   * Was the first four other products in the catalogue, whatever this one
   * was. Now ranked: bought together, then routine fit, never sold out and
   * never an ingredient conflict with this product.
   */
  const recommendations = (await recommendationsFor(product.id, { stock }))
    .map((r) => getProductById(r.productId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
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
        // `<` escaped so editable text containing "</script>" cannot close
        // this tag early and inject markup into the page.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <ProductClient
        product={product}
        recommendations={recommendations}
        stockBySize={stockBySize}
        pricesBySize={pricesBySize}
        catalogueStock={stock}
        cataloguePrices={prices}
        howToUse={copy?.howToUse || null}
        highlights={copy?.highlights ?? []}
      />
    </>
  );
}
