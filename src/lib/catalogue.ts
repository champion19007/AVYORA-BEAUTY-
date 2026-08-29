import { PRODUCTS, Product } from '@/data/mock-data';

/**
 * Indexed, read-only view of the product catalogue.
 *
 * Lookups were previously linear scans (`PRODUCTS.find(...)`) repeated per
 * request and per render. The catalogue is fixed at build time, so the indexes
 * below are built once per process and every lookup is O(1). This matters on
 * the product page and in the header, which resolve many SKUs per render.
 */

const byId = new Map<string, Product>();
const bySlug = new Map<string, Product>();
const byCategory = new Map<string, Product[]>();
const byConcern = new Map<string, Product[]>();

for (const product of PRODUCTS) {
  byId.set(product.id, product);
  bySlug.set(product.slug, product);

  const cat = byCategory.get(product.category) ?? [];
  cat.push(product);
  byCategory.set(product.category, cat);

  for (const concern of product.concerns) {
    const list = byConcern.get(concern) ?? [];
    list.push(product);
    byConcern.set(concern, list);
  }
}

/** Every product, in catalogue order. */
export function allProducts(): readonly Product[] {
  return PRODUCTS;
}

export function getProductById(id: string): Product | undefined {
  return byId.get(id);
}

export function getProductBySlug(slug: string): Product | undefined {
  return bySlug.get(slug);
}

export function getProductsByCategory(category: string): readonly Product[] {
  return byCategory.get(category) ?? [];
}

export function getProductsByConcern(concern: string): readonly Product[] {
  return byConcern.get(concern) ?? [];
}

/** Category ids that currently have at least one product. */
export function activeCategories(): ReadonlySet<string> {
  return new Set(byCategory.keys());
}

/** Concern ids that currently have at least one product. */
export function activeConcerns(): ReadonlySet<string> {
  return new Set(byConcern.keys());
}

/**
 * The lowest advertised price for a SKU, used for listing and structured data.
 */
export function priceFrom(product: Product): number {
  return product.salePrice ?? Math.min(...product.sizes.map((s) => s.price));
}
