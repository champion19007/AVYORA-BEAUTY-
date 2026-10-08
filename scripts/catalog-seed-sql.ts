/**
 * Prints the data half of a catalogue migration: product and variant rows
 * from the catalogue file, the backfill of `variant_id` on existing rows,
 * and the trigger that keeps it filled.
 *
 *   npx tsx scripts/catalog-seed-sql.ts            # full 0014 data section
 *   npx tsx scripts/catalog-seed-sql.ts --rows     # rows only, for a later migration
 *
 * Rows are inserted with ON CONFLICT DO NOTHING, so rerunning on a database
 * that already has them changes nothing. Refuses to print anything if the
 * catalogue has duplicate ids, slugs or keys.
 */
import { PRODUCTS } from '../src/data/mock-data';
import { catalogProblems, catalogRecords } from '../src/modules/catalog/catalog-records';

const problems = catalogProblems(PRODUCTS);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const BREAK = '--> statement-breakpoint';
const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
const { products, variants } = catalogRecords(PRODUCTS);
const out: string[] = [];

out.push(
  `INSERT INTO "catalog_products" ("id", "slug", "name", "category") VALUES\n` +
    products.map((p) => `  (${q(p.id)}, ${q(p.slug)}, ${q(p.name)}, ${q(p.category)})`).join(',\n') +
    `\nON CONFLICT ("id") DO NOTHING;`
);
out.push(
  `INSERT INTO "catalog_variants" ("id", "product_id", "legacy_stock_key", "size_label", "volume_ml") VALUES\n` +
    variants
      .map((v) => `  (${q(v.id)}, ${q(v.productId)}, ${q(v.legacyStockKey)}, ${q(v.sizeLabel)}, ${q(v.volumeMl)})`)
      .join(',\n') +
    `\nON CONFLICT ("id") DO NOTHING;`
);

if (!process.argv.includes('--rows')) {
  const TABLES = ['inventory', 'product_pricing', 'cart_items', 'order_items', 'restock_requests'];

  // The compatibility key can never disagree with the columns it encodes.
  out.push(
    `ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_legacy_key_matches" ` +
      `CHECK ("legacy_stock_key" = "product_id" || '::' || "size_label");`
  );
  out.push(`ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_volume_positive" CHECK ("volume_ml" IS NULL OR "volume_ml" > 0);`);

  for (const t of TABLES) {
    out.push(
      `UPDATE "${t}" SET "variant_id" = v."id" FROM "catalog_variants" v ` +
        `WHERE v."legacy_stock_key" = "${t}"."product_id" || '::' || "${t}"."size";`
    );
  }

  /*
   * Fills variant_id from (product_id, size) on every write, so code written
   * before 0014 records the SKU without changing. An unknown pair leaves it
   * null (reported by `npm run db:check-catalog`); an explicit variant_id
   * that contradicts the pair is refused.
   */
  out.push(`CREATE OR REPLACE FUNCTION "resolve_catalog_variant"() RETURNS trigger AS $$
DECLARE
  resolved text;
BEGIN
  -- On UPDATE an unchanged variant_id is the old row's, not a new claim.
  IF TG_OP = 'UPDATE' AND NEW."variant_id" IS NOT DISTINCT FROM OLD."variant_id" THEN
    NEW."variant_id" := NULL;
  END IF;
  SELECT "id" INTO resolved FROM "catalog_variants"
    WHERE "legacy_stock_key" = NEW."product_id" || '::' || NEW."size";
  IF resolved IS NOT NULL THEN
    IF NEW."variant_id" IS NOT NULL AND NEW."variant_id" <> resolved THEN
      RAISE EXCEPTION 'variant_id % does not match % / %', NEW."variant_id", NEW."product_id", NEW."size";
    END IF;
    NEW."variant_id" := resolved;
  ELSIF NEW."variant_id" IS NOT NULL THEN
    RAISE EXCEPTION 'variant_id % given for unknown SKU % / %', NEW."variant_id", NEW."product_id", NEW."size";
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;`);

  for (const t of TABLES) {
    out.push(
      `CREATE TRIGGER "${t}_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ` +
        `ON "${t}" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();`
    );
  }
}

console.log(out.join(`${BREAK}\n`));
