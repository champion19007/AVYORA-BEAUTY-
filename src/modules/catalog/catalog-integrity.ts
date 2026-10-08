import { isNull, or, lte, gt, lt, and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import type { Product } from '@/data/mock-data';
import { catalogProblems, catalogRecords } from '@/modules/catalog/catalog-records';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type CatalogIntegrityReport = {
  /** Problems in the catalogue file itself (duplicates, impossible prices). */
  catalogue: string[];
  /** File and database disagree about which products and variants exist. */
  coverage: string[];
  /** Rows whose (product, size) resolved to no variant, per table. */
  unresolved: { table: string; productId: string; size: string; count: number }[];
  /** Overrides that could not be charged, and impossible stock. */
  priceAndStock: string[];
};

export function isClean(r: CatalogIntegrityReport): boolean {
  return !r.catalogue.length && !r.coverage.length && !r.unresolved.length && !r.priceAndStock.length;
}

/**
 * Read-only check that the normalised catalogue matches the file, and that
 * every stock, price, cart, order and restock row maps to a SKU. Run by
 * `npm run db:check-catalog` before and after deploying 0014, and by the
 * migration test against seeded fixtures.
 */
export async function catalogIntegrity(db: Db, products: readonly Product[]): Promise<CatalogIntegrityReport> {
  const expected = catalogRecords(products);
  const coverage: string[] = [];

  const dbProducts = await db.select().from(schema.catalogProducts);
  const dbVariants = await db.select().from(schema.catalogVariants);
  const productsById = new Map(dbProducts.map((p) => [p.id, p]));
  const variantsById = new Map(dbVariants.map((v) => [v.id, v]));

  for (const p of expected.products) {
    const row = productsById.get(p.id);
    if (!row) coverage.push(`Product missing from catalog_products: ${p.id}`);
    else if (row.slug !== p.slug) coverage.push(`Slug differs for ${p.id}: file ${p.slug}, database ${row.slug}`);
  }
  for (const v of expected.variants) {
    const row = variantsById.get(v.id);
    if (!row) coverage.push(`Variant missing from catalog_variants: ${v.id} (${v.legacyStockKey})`);
    else if (row.legacyStockKey !== v.legacyStockKey) coverage.push(`Variant ${v.id} maps to ${row.legacyStockKey}, file says ${v.legacyStockKey}`);
  }
  const fileVariantIds = new Set(expected.variants.map((v) => v.id));
  for (const v of dbVariants) {
    if (v.active && !fileVariantIds.has(v.id)) coverage.push(`Active variant not in the catalogue file: ${v.id}`);
  }

  const unresolved: CatalogIntegrityReport['unresolved'] = [];
  const tables = [
    ['inventory', schema.inventory],
    ['product_pricing', schema.productPricing],
    ['cart_items', schema.cartItems],
    ['order_items', schema.orderItems],
    ['restock_requests', schema.restockRequests],
  ] as const;
  for (const [name, t] of tables) {
    const rows = await db
      .select({ productId: t.productId, size: t.size })
      .from(t)
      .where(isNull(t.variantId));
    const counts = new Map<string, { productId: string; size: string; count: number }>();
    for (const r of rows) {
      const key = `${r.productId}::${r.size}`;
      const c = counts.get(key) ?? { productId: r.productId, size: r.size, count: 0 };
      c.count += 1;
      counts.set(key, c);
    }
    for (const c of counts.values()) unresolved.push({ table: name, ...c });
  }

  const priceAndStock: string[] = [];
  const badPrices = await db
    .select()
    .from(schema.productPricing)
    .where(
      or(
        lte(schema.productPricing.price, 0),
        lte(schema.productPricing.salePrice, 0),
        gt(schema.productPricing.salePrice, schema.productPricing.price)
      )
    );
  for (const r of badPrices) {
    priceAndStock.push(`Price override for ${r.productId} ${r.size}: price ${r.price}, sale ${r.salePrice}`);
  }
  const badStock = await db
    .select()
    .from(schema.inventory)
    .where(and(lt(schema.inventory.quantity, 0), eq(schema.inventory.allowBackorder, false)));
  for (const r of badStock) priceAndStock.push(`Negative stock without backorder: ${r.productId} ${r.size} (${r.quantity})`);

  return { catalogue: catalogProblems(products), coverage, unresolved, priceAndStock };
}
