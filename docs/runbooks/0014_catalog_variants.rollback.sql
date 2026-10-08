-- Rollback for migration 0014_catalog_variants.
--
-- Only needed if the schema itself must go; rolling back the application
-- does NOT require this (see docs/implementation-progress.md, prompt 5).
-- Removes the triggers, the variant_id columns and the two catalogue tables.
-- No pre-0014 data is touched: product_id, size, names and prices on every
-- row are exactly as they were. Run in one transaction, after taking a Neon
-- branch of production.

BEGIN;

DROP TRIGGER IF EXISTS "inventory_resolve_variant" ON "inventory";
DROP TRIGGER IF EXISTS "product_pricing_resolve_variant" ON "product_pricing";
DROP TRIGGER IF EXISTS "cart_items_resolve_variant" ON "cart_items";
DROP TRIGGER IF EXISTS "order_items_resolve_variant" ON "order_items";
DROP TRIGGER IF EXISTS "restock_requests_resolve_variant" ON "restock_requests";
DROP FUNCTION IF EXISTS "resolve_catalog_variant"();

ALTER TABLE "inventory" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "product_pricing" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "restock_requests" DROP COLUMN IF EXISTS "variant_id";

DROP TABLE IF EXISTS "catalog_variants";
DROP TABLE IF EXISTS "catalog_products";

-- Lets `npm run db:migrate` apply 0014 again later.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791388119899;

COMMIT;
