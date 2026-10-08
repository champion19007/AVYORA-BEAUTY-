CREATE TABLE "catalog_products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"legacy_stock_key" text NOT NULL,
	"size_label" text NOT NULL,
	"volume_ml" numeric(8, 2),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "product_pricing" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_products_slug_idx" ON "catalog_products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "catalog_products_category_idx" ON "catalog_products" USING btree ("category","published");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_legacy_key_idx" ON "catalog_variants" USING btree ("legacy_stock_key");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_product_size_idx" ON "catalog_variants" USING btree ("product_id","size_label");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pricing" ADD CONSTRAINT "product_pricing_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_variant_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_variant_idx" ON "inventory" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_pricing_variant_idx" ON "product_pricing" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "restock_variant_idx" ON "restock_requests" USING btree ("variant_id");--> statement-breakpoint
INSERT INTO "catalog_products" ("id", "slug", "name", "category") VALUES
  ('rice-bran-cleansing-oil', 'rice-bran-cleansing-oil', 'Rice Bran Cleansing Oil', 'cleanser'),
  ('centella-cleansing-balm', 'centella-cleansing-balm', 'Centella Cleansing Balm', 'cleanser'),
  ('face-wash', 'face-wash', 'Low-pH Amino Acid Gel Cleanser', 'cleanser'),
  ('papaya-enzyme-powder', 'papaya-enzyme-powder', 'Papaya Enzyme Powder Wash', 'cleanser'),
  ('pha-refining-fluid', 'pha-refining-fluid', 'PHA Refining Fluid', 'exfoliator'),
  ('lha-sebum-control', 'lha-sebum-control', 'LHA Sebum-Control Liquid', 'exfoliator'),
  ('bifida-exfoliating-pads', 'bifida-exfoliating-pads', 'Bifida Exfoliating Toner Pads', 'exfoliator'),
  ('ha-toner', 'ha-toner', 'Multi-Molecular Hyaluronic Toner', 'toner'),
  ('rice-toner', 'rice-toner', 'Milky Ceramides & Rice Toner', 'toner'),
  ('heartleaf-liquid', 'heartleaf-liquid', 'Heartleaf Calming Skin Liquid', 'toner'),
  ('galacto-essence', 'galacto-essence', 'Galactomyces Ferment Essence', 'essence'),
  ('snail-essence', 'snail-essence', 'Advanced Snail Mucin Essence', 'essence'),
  ('kombucha-essence', 'kombucha-essence', 'Kombucha Probiotic Essence', 'essence'),
  ('vitamin-c-serum', 'vitamin-c-serum', 'Vitamin C Serum', 'serum'),
  ('niacinamide-drops', 'niacinamide-drops', '10% Niacinamide Glow Drops', 'serum'),
  ('retinol', 'retinol', 'Encapsulated Retinal Ampoule', 'serum'),
  ('copper-peptide', 'copper-peptide', 'Copper Peptide Plumping Fluid', 'serum'),
  ('pdrn-booster', 'pdrn-booster', 'Salmon DNA Cellular Booster', 'serum'),
  ('propolis-ampoule', 'propolis-ampoule', '70% Propolis Boosting Ampoule', 'serum'),
  ('collagen-mask', 'collagen-mask', 'Hydrogel Collagen Melting Mask', 'mask'),
  ('eye-patches', 'eye-patches', 'Caffeine & Peptide Eye Patches', 'mask'),
  ('ceramide-cream', 'ceramide-cream', '5x Essential Ceramide Cream', 'moisturizer'),
  ('sorbet-moisturizer', 'sorbet-moisturizer', 'Water-Gel Sorbet Moisturizer', 'moisturizer'),
  ('sunscreen', 'sunscreen', 'Probiotics Relief Sun Cream', 'moisturizer'),
  ('sun-stick', 'sun-stick', 'Cica Calming Sun Stick', 'moisturizer'),
  ('lip-mask', 'lip-mask', 'Ceramide Lip Sleeping Mask', 'moisturizer'),
  ('body-lotion', 'body-lotion', 'Body Lotion', 'body')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "catalog_variants" ("id", "product_id", "legacy_stock_key", "size_label", "volume_ml") VALUES
  ('rice-bran-cleansing-oil-150ml', 'rice-bran-cleansing-oil', 'rice-bran-cleansing-oil::150ml', '150ml', 150),
  ('centella-cleansing-balm-100ml', 'centella-cleansing-balm', 'centella-cleansing-balm::100ml', '100ml', 100),
  ('face-wash-150ml', 'face-wash', 'face-wash::150ml', '150ml', 150),
  ('papaya-enzyme-powder-60g', 'papaya-enzyme-powder', 'papaya-enzyme-powder::60g', '60g', NULL),
  ('pha-refining-fluid-30ml', 'pha-refining-fluid', 'pha-refining-fluid::30ml', '30ml', 30),
  ('lha-sebum-control-30ml', 'lha-sebum-control', 'lha-sebum-control::30ml', '30ml', 30),
  ('bifida-exfoliating-pads-60pads', 'bifida-exfoliating-pads', 'bifida-exfoliating-pads::60 Pads', '60 Pads', NULL),
  ('ha-toner-200ml', 'ha-toner', 'ha-toner::200ml', '200ml', 200),
  ('rice-toner-150ml', 'rice-toner', 'rice-toner::150ml', '150ml', 150),
  ('heartleaf-liquid-200ml', 'heartleaf-liquid', 'heartleaf-liquid::200ml', '200ml', 200),
  ('galacto-essence-100ml', 'galacto-essence', 'galacto-essence::100ml', '100ml', 100),
  ('snail-essence-100ml', 'snail-essence', 'snail-essence::100ml', '100ml', 100),
  ('kombucha-essence-150ml', 'kombucha-essence', 'kombucha-essence::150ml', '150ml', 150),
  ('vitamin-c-serum-10ml', 'vitamin-c-serum', 'vitamin-c-serum::10ml', '10ml', 10),
  ('vitamin-c-serum-30ml', 'vitamin-c-serum', 'vitamin-c-serum::30ml', '30ml', 30),
  ('niacinamide-drops-30ml', 'niacinamide-drops', 'niacinamide-drops::30ml', '30ml', 30),
  ('retinol-30ml', 'retinol', 'retinol::30ml', '30ml', 30),
  ('retinol-90ml', 'retinol', 'retinol::90ml', '90ml', 90),
  ('copper-peptide-30ml', 'copper-peptide', 'copper-peptide::30ml', '30ml', 30),
  ('pdrn-booster-30ml', 'pdrn-booster', 'pdrn-booster::30ml', '30ml', 30),
  ('propolis-ampoule-30ml', 'propolis-ampoule', 'propolis-ampoule::30ml', '30ml', 30),
  ('collagen-mask-1mask', 'collagen-mask', 'collagen-mask::1 Mask', '1 Mask', NULL),
  ('eye-patches-60patches', 'eye-patches', 'eye-patches::60 Patches', '60 Patches', NULL),
  ('ceramide-cream-50ml', 'ceramide-cream', 'ceramide-cream::50ml', '50ml', 50),
  ('sorbet-moisturizer-50ml', 'sorbet-moisturizer', 'sorbet-moisturizer::50ml', '50ml', 50),
  ('sunscreen-30ml', 'sunscreen', 'sunscreen::30ml', '30ml', 30),
  ('sunscreen-50ml', 'sunscreen', 'sunscreen::50ml', '50ml', 50),
  ('sun-stick-20g', 'sun-stick', 'sun-stick::20g', '20g', NULL),
  ('lip-mask-20g', 'lip-mask', 'lip-mask::20g', '20g', NULL),
  ('body-lotion-180ml', 'body-lotion', 'body-lotion::180ml', '180ml', 180)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_legacy_key_matches" CHECK ("legacy_stock_key" = "product_id" || '::' || "size_label");--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_volume_positive" CHECK ("volume_ml" IS NULL OR "volume_ml" > 0);--> statement-breakpoint
UPDATE "inventory" SET "variant_id" = v."id" FROM "catalog_variants" v WHERE v."legacy_stock_key" = "inventory"."product_id" || '::' || "inventory"."size";--> statement-breakpoint
UPDATE "product_pricing" SET "variant_id" = v."id" FROM "catalog_variants" v WHERE v."legacy_stock_key" = "product_pricing"."product_id" || '::' || "product_pricing"."size";--> statement-breakpoint
UPDATE "cart_items" SET "variant_id" = v."id" FROM "catalog_variants" v WHERE v."legacy_stock_key" = "cart_items"."product_id" || '::' || "cart_items"."size";--> statement-breakpoint
UPDATE "order_items" SET "variant_id" = v."id" FROM "catalog_variants" v WHERE v."legacy_stock_key" = "order_items"."product_id" || '::' || "order_items"."size";--> statement-breakpoint
UPDATE "restock_requests" SET "variant_id" = v."id" FROM "catalog_variants" v WHERE v."legacy_stock_key" = "restock_requests"."product_id" || '::' || "restock_requests"."size";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "resolve_catalog_variant"() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "inventory_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ON "inventory" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();--> statement-breakpoint
CREATE TRIGGER "product_pricing_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ON "product_pricing" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();--> statement-breakpoint
CREATE TRIGGER "cart_items_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ON "cart_items" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();--> statement-breakpoint
CREATE TRIGGER "order_items_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ON "order_items" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();--> statement-breakpoint
CREATE TRIGGER "restock_requests_resolve_variant" BEFORE INSERT OR UPDATE OF "product_id", "size", "variant_id" ON "restock_requests" FOR EACH ROW EXECUTE FUNCTION "resolve_catalog_variant"();
