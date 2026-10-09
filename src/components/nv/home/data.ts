import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { reviews } from '@/db/schema';
import { PRODUCTS, type Product } from '@/data/mock-data';
import { ROUTINE_ROLES } from '@/data/routine-roles';
import type { DisplayPrices, StockByKey } from '@/modules/catalog/storefront-data';

/**
 * Data for the redesign landing page, from the same authoritative loaders
 * the shop uses (display prices with offers applied, counted stock). Server
 * only; the page is ISR-cached, so none of this runs per visitor.
 */

/**
 * Catalogue photographs that must not be shown on the landing page: this
 * stock image (used for three products) shows another brand's label.
 * Replacing it in the catalogue is pending approved product photography.
 */
const THIRD_PARTY_BRANDED_IMAGES = ['photo-1601049541289-9b1b7bbbfe19'];
const imageExcluded = (p: Product) => THIRD_PARTY_BRANDED_IMAGES.some((id) => p.images[0]?.includes(id));

export type SkuOffer = { size: string; pricePaise: number; wasPaise: number | null; inStock: boolean };
export type LandingProduct = { id: string; slug: string; name: string; image: string; concerns: string[]; skus: SkuOffer[] };

function offersFor(p: Product, prices: DisplayPrices, stock: StockByKey): SkuOffer[] {
  return p.sizes.flatMap((s) => {
    const key = `${p.id}::${s.label}`;
    const price = prices[key];
    if (!price) return [];
    // Uncounted stock is not sellable, as at checkout.
    return [{ size: s.label, pricePaise: price.price, wasPaise: price.wasPrice, inStock: (stock[key] ?? 0) > 0 }];
  });
}

const toLanding = (p: Product, prices: DisplayPrices, stock: StockByKey): LandingProduct => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  image: p.images[0],
  concerns: p.concerns.slice(0, 2),
  skus: offersFor(p, prices, stock),
});

/** Four best sellers with a priced SKU, best sellers first, then new launches. */
export function featuredProducts(prices: DisplayPrices, stock: StockByKey): LandingProduct[] {
  const ranked = [...PRODUCTS.filter((p) => p.isBestSeller), ...PRODUCTS.filter((p) => !p.isBestSeller && p.isNewLaunch)];
  return ranked
    .filter((p) => !imageExcluded(p) && ROUTINE_ROLES[p.id] !== 'none')
    .map((p) => toLanding(p, prices, stock))
    .filter((p) => p.skus.length > 0)
    .slice(0, 4);
}

export type EssentialStep = { role: 'cleanse' | 'moisturise' | 'protect'; label: string; from: { product: LandingProduct; sku: SkuOffer } | null };

/**
 * The three essential steps, each with the lowest current price among
 * in-stock SKUs of products in that role. A fact about the catalogue, not
 * a recommendation: the routine finder chooses per customer.
 */
export function essentialSteps(prices: DisplayPrices, stock: StockByKey): EssentialStep[] {
  const steps = [
    { role: 'cleanse' as const, label: 'Cleanse' },
    { role: 'moisturise' as const, label: 'Moisturise' },
    { role: 'protect' as const, label: 'Protect' },
  ];
  return steps.map((step) => {
    let best: EssentialStep['from'] = null;
    for (const p of PRODUCTS.filter((x) => ROUTINE_ROLES[x.id] === step.role)) {
      const product = toLanding(p, prices, stock);
      for (const sku of product.skus.filter((s) => s.inStock)) {
        if (!best || sku.pricePaise < best.sku.pricePaise) best = { product, sku };
      }
    }
    return { ...step, from: best };
  });
}

export type LandingReview = { rating: number; title: string | null; body: string; productName: string; productSlug: string | null; verified: boolean };

/** One published review, verified purchases first. None is invented: no published review means none is shown. */
export async function publishedReview(): Promise<LandingReview | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const [row] = await db
      .select({ rating: reviews.rating, title: reviews.title, body: reviews.body, productId: reviews.productId, orderId: reviews.orderId })
      .from(reviews)
      .where(and(eq(reviews.published, true), isNotNull(reviews.body)))
      .orderBy(desc(isNotNull(reviews.orderId)), desc(reviews.createdAt))
      .limit(1);
    if (!row?.body) return null;
    return {
      rating: row.rating,
      title: row.title,
      body: row.body,
      productName: PRODUCTS.find((p) => p.id === row.productId)?.name ?? 'Avyora product',
      productSlug: PRODUCTS.find((p) => p.id === row.productId)?.slug ?? null,
      verified: row.orderId !== null,
    };
  } catch {
    return null;
  }
}
