CREATE TABLE "evidence_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"source_type" text NOT NULL,
	"retrieved_at" text NOT NULL,
	"limitations" text NOT NULL,
	CONSTRAINT "evidence_sources_https" CHECK ("evidence_sources"."url" IS NULL OR "evidence_sources"."url" LIKE 'https://%'),
	CONSTRAINT "evidence_sources_type" CHECK ("evidence_sources"."source_type" IN ('formulation_dossier', 'label', 'regulation', 'literature', 'clinician_note'))
);
--> statement-breakpoint
CREATE TABLE "formulation_ingredients" (
	"formulation_id" text NOT NULL,
	"position" smallint NOT NULL,
	"inci_label" text NOT NULL,
	"ingredient_id" text,
	"concentration_known" boolean DEFAULT false NOT NULL,
	"concentration" numeric(9, 4),
	"unit" text,
	CONSTRAINT "formulation_ingredients_formulation_id_position_pk" PRIMARY KEY("formulation_id","position"),
	CONSTRAINT "formulation_ingredients_concentration" CHECK (("formulation_ingredients"."concentration_known" AND "formulation_ingredients"."concentration" > 0 AND "formulation_ingredients"."unit" IN ('percent_w_w', 'percent_w_v', 'mg_per_g', 'mg_per_ml')
        AND ("formulation_ingredients"."unit" NOT LIKE 'percent%' OR "formulation_ingredients"."concentration" <= 100))
     OR (NOT "formulation_ingredients"."concentration_known" AND "formulation_ingredients"."concentration" IS NULL AND "formulation_ingredients"."unit" IS NULL)),
	CONSTRAINT "formulation_ingredients_position" CHECK ("formulation_ingredients"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "formulations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"version" integer NOT NULL,
	"coverage" text NOT NULL,
	"full_inci" text,
	"source_id" text NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" text NOT NULL,
	CONSTRAINT "formulations_coverage" CHECK ("formulations"."coverage" IN ('complete', 'partial', 'unknown')),
	CONSTRAINT "formulations_complete_has_inci" CHECK ("formulations"."coverage" <> 'complete' OR "formulations"."full_inci" IS NOT NULL),
	CONSTRAINT "formulations_version_positive" CHECK ("formulations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ingredient_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"ingredient_id" text,
	"ambiguous_candidates" jsonb,
	CONSTRAINT "ingredient_aliases_one_meaning" CHECK (("ingredient_aliases"."ingredient_id" IS NULL) <> ("ingredient_aliases"."ambiguous_candidates" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "usage_profiles" (
	"formulation_id" text PRIMARY KEY NOT NULL,
	"session" text NOT NULL,
	"frequency" text NOT NULL,
	"directions" text NOT NULL,
	"max_weekly_uses" smallint,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" text NOT NULL,
	CONSTRAINT "usage_profiles_session" CHECK ("usage_profiles"."session" IN ('am', 'pm', 'am_or_pm')),
	CONSTRAINT "usage_profiles_weekly" CHECK ("usage_profiles"."max_weekly_uses" IS NULL OR "usage_profiles"."max_weekly_uses" BETWEEN 1 AND 14)
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "class" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "formulation_ingredients" ADD CONSTRAINT "formulation_ingredients_formulation_id_formulations_id_fk" FOREIGN KEY ("formulation_id") REFERENCES "public"."formulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulation_ingredients" ADD CONSTRAINT "formulation_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulations" ADD CONSTRAINT "formulations_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulations" ADD CONSTRAINT "formulations_source_id_evidence_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."evidence_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_profiles" ADD CONSTRAINT "usage_profiles_formulation_id_formulations_id_fk" FOREIGN KEY ("formulation_id") REFERENCES "public"."formulations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "formulation_ingredients_ingredient_idx" ON "formulation_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formulations_product_version_idx" ON "formulations" USING btree ("product_id","version");--> statement-breakpoint
CREATE INDEX "ingredient_aliases_ingredient_idx" ON "ingredient_aliases" USING btree ("ingredient_id");