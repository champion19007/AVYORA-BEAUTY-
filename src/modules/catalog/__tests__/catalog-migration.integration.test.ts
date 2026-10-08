import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { PRODUCTS, type Product } from '@/data/mock-data';
import { catalogIntegrity, isClean } from '@/modules/catalog/catalog-integrity';
import { catalogProblems, catalogRecords, variantId, volumeMl } from '@/modules/catalog/catalog-records';
import { getVariant, getVariantById } from '@/lib/catalogue';

/*
 * Production already has rows keyed only by (product_id, size). This applies
 * every migration before 0014, writes rows in that legacy shape, then applies
 * 0014 — the same order a real deploy runs — and checks what came out.
 */

const MIGRATION = '0014_catalog_variants';
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let preDir: string;

const q = (text: string, params: unknown[] = []) => client.query(text, params);

beforeAll(async () => {
  // A copy of the migrations folder that stops before 0014.
  preDir = mkdtempSync(join(tmpdir(), 'pre0014-'));
  cpSync('drizzle', preDir, { recursive: true });
  // Drop 0014 and everything after it, so later migrations never run without it.
  const journalPath = join(preDir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === MIGRATION);
  for (const e of journal.entries.slice(cut)) rmSync(join(preDir, `${e.tag}.sql`));
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));

  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: preDir });

  // Legacy rows, as the application wrote them before 0014.
  await q(`INSERT INTO inventory (product_id, size, quantity) VALUES
    ('retinol', '30ml', 25), ('retinol', '90ml', 22), ('retired-serum', '15ml', 3)`);
  await q(`INSERT INTO product_pricing (id, product_id, size, price, sale_price) VALUES ('p1', 'retinol', '90ml', 99900, NULL)`);
  await q(`INSERT INTO carts (id) VALUES ('c1')`);
  await q(`INSERT INTO cart_items (cart_id, product_id, size, quantity) VALUES ('c1', 'retinol', '90ml', 3)`);
  await q(`INSERT INTO orders (id, order_number, email, subtotal, total) VALUES ('o1', 'AVY-TEST01', 'a@b.test', 299700, 299700)`);
  await q(`INSERT INTO order_items (order_id, product_id, product_name, size, unit_price, quantity, line_total) VALUES
    ('o1', 'retinol', 'Retinol Night Serum (old name)', '90ml', 99900, 3, 299700),
    ('o1', 'retired-serum', 'A serum no longer sold', '15ml', 50000, 1, 50000)`);
  await q(`INSERT INTO restock_requests (id, product_id, size, requested_quantity, quantity_at_request, requested_by)
    VALUES ('r1', 'retinol', '30ml', 50, 2, 'manager')`);

  await migrate(db, { migrationsFolder: 'drizzle' });
}, 60_000);

afterAll(async () => {
  await client?.close();
  rmSync(preDir, { recursive: true, force: true });
});

describe('catalogue records', () => {
  it('gives every size of every product one stable id', () => {
    const { products, variants } = catalogRecords(PRODUCTS);
    expect(products).toHaveLength(PRODUCTS.length);
    expect(variants).toHaveLength(PRODUCTS.reduce((n, p) => n + p.sizes.length, 0));
    expect(catalogProblems(PRODUCTS)).toEqual([]);
    expect(variantId('retinol', '90ml')).toBe('retinol-90ml');
    expect(variantId('bifida-exfoliating-pads', '60 Pads')).toBe('bifida-exfoliating-pads-60pads');
    expect(variantId('retinol', '30 ML')).toBe(variantId('retinol', '30ml'));
  });

  it('records millilitres only when the label says millilitres', () => {
    expect(volumeMl('90ml')).toBe(90);
    expect(volumeMl('60g')).toBeNull();
    expect(volumeMl('60 Pads')).toBeNull();
    expect(volumeMl('1 Mask')).toBeNull();
  });

  it('finds duplicates and impossible prices', () => {
    const base = PRODUCTS[0];
    const broken: Product[] = [
      base,
      { ...base, id: 'copy', slug: base.slug },
      { ...base, id: 'free', slug: 'free', sizes: [{ label: '30ml', price: 0 }, { label: '30 ML', price: 10 }] },
    ];
    const problems = catalogProblems(broken);
    expect(problems).toContain(`Duplicate slug: ${base.slug}`);
    expect(problems).toContain('Impossible price: free 30ml 0');
    expect(problems).toContain('Duplicate variant id: free-30ml');
  });

  it('resolves variants in memory the same way', () => {
    expect(getVariant('retinol', '90ml')?.id).toBe('retinol-90ml');
    expect(getVariant('retinol', '60ml')).toBeUndefined();
    expect(getVariantById('retinol-30ml')?.legacyStockKey).toBe('retinol::30ml');
  });
});

describe('migration 0014 on legacy rows', () => {
  it('seeds every catalogue product and variant', async () => {
    const report = await catalogIntegrity(db as never, PRODUCTS);
    expect(report.catalogue).toEqual([]);
    expect(report.coverage).toEqual([]);
  });

  it('maps existing stock, prices, carts, orders and restock requests to their SKU', async () => {
    const { rows } = await q(`
      SELECT 'inventory' t, product_id, size, variant_id FROM inventory
      UNION ALL SELECT 'pricing', product_id, size, variant_id FROM product_pricing
      UNION ALL SELECT 'cart', product_id, size, variant_id FROM cart_items
      UNION ALL SELECT 'order', product_id, size, variant_id FROM order_items
      UNION ALL SELECT 'restock', product_id, size, variant_id FROM restock_requests
      ORDER BY 1, 2, 3`);
    expect(rows).toEqual([
      { t: 'cart', product_id: 'retinol', size: '90ml', variant_id: 'retinol-90ml' },
      { t: 'inventory', product_id: 'retinol', size: '30ml', variant_id: 'retinol-30ml' },
      { t: 'inventory', product_id: 'retinol', size: '90ml', variant_id: 'retinol-90ml' },
      { t: 'inventory', product_id: 'retired-serum', size: '15ml', variant_id: null },
      { t: 'order', product_id: 'retinol', size: '90ml', variant_id: 'retinol-90ml' },
      { t: 'order', product_id: 'retired-serum', size: '15ml', variant_id: null },
      { t: 'pricing', product_id: 'retinol', size: '90ml', variant_id: 'retinol-90ml' },
      { t: 'restock', product_id: 'retinol', size: '30ml', variant_id: 'retinol-30ml' },
    ]);
  });

  it('reports what it could not map, without inventing a variant', async () => {
    const report = await catalogIntegrity(db as never, PRODUCTS);
    expect(report.unresolved).toEqual([
      { table: 'inventory', productId: 'retired-serum', size: '15ml', count: 1 },
      { table: 'order_items', productId: 'retired-serum', size: '15ml', count: 1 },
    ]);
    expect(isClean(report)).toBe(false);
    const { rows } = await q(`SELECT count(*)::int n FROM catalog_variants WHERE product_id = 'retired-serum'`);
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('leaves historical order names, sizes and charged prices untouched', async () => {
    const { rows } = await q(`SELECT product_name, size, unit_price, quantity, line_total FROM order_items WHERE product_id = 'retinol'`);
    expect(rows).toEqual([
      { product_name: 'Retinol Night Serum (old name)', size: '90ml', unit_price: 99900, quantity: 3, line_total: 299700 },
    ]);
  });

  it('fills the SKU on writes from code that only knows (product, size)', async () => {
    await q(`INSERT INTO inventory (product_id, size, quantity) VALUES ('vitamin-c-serum', '30ml', 5)`);
    await q(`UPDATE product_pricing SET size = '30ml' WHERE product_id = 'retinol'`);
    const { rows } = await q(`
      SELECT (SELECT variant_id FROM inventory WHERE product_id = 'vitamin-c-serum') inv,
             (SELECT variant_id FROM product_pricing WHERE product_id = 'retinol') price`);
    expect(rows).toEqual([{ inv: 'vitamin-c-serum-30ml', price: 'retinol-30ml' }]);
  });

  it('refuses a variant id that contradicts the product and size', async () => {
    await expect(
      q(`INSERT INTO restock_requests (id, product_id, size, variant_id, requested_quantity, quantity_at_request, requested_by)
         VALUES ('r2', 'retinol', '30ml', 'retinol-90ml', 1, 1, 'm')`)
    ).rejects.toThrow(/does not match/);
  });

  it('enforces one stock row and one price row per SKU, and consistent keys', async () => {
    await expect(q(`INSERT INTO catalog_products (id, slug, name, category) VALUES ('x', 'retinol', 'X', 'serum')`)).rejects.toThrow();
    await expect(
      q(`INSERT INTO catalog_variants (id, product_id, legacy_stock_key, size_label) VALUES ('retinol-x', 'retinol', 'retinol::90ml', 'x')`)
    ).rejects.toThrow();
    await expect(q(`DELETE FROM catalog_variants WHERE id = 'retinol-90ml'`)).rejects.toThrow();
  });

  it('flags impossible prices and stock', async () => {
    await q(`UPDATE product_pricing SET sale_price = price + 1 WHERE product_id = 'retinol'`);
    await q(`UPDATE inventory SET quantity = -1 WHERE product_id = 'vitamin-c-serum'`);
    const report = await catalogIntegrity(db as never, PRODUCTS);
    expect(report.priceAndStock).toHaveLength(2);
  });
});
