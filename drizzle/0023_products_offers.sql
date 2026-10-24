CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"percent_off" integer,
	"amount_paise" integer,
	"buy_qty" integer,
	"get_qty" integer,
	"product_ids" jsonb,
	"min_subtotal_paise" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"coupon_code" text,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"max_uses" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_kind_check" CHECK ("offers"."kind" IN ('percent_off', 'amount_off', 'buy_x_get_y', 'free_delivery'))
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "status" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "how_to_use" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "key_ingredients" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "full_ingredients" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "skin_types" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "concerns" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "images" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "routine_slot" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "is_best_seller" boolean;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "is_new" boolean;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "cost_paise" integer;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offer_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offer_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_coupon_code_idx" ON "offers" USING btree ("coupon_code");--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_status_check" CHECK ("catalog_products"."status" IN ('draft', 'live', 'hidden'));