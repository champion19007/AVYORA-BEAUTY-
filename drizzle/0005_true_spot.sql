ALTER TYPE "public"."order_status" ADD VALUE 'out_for_delivery' BEFORE 'delivered';--> statement-breakpoint
CREATE TABLE "product_pricing" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text NOT NULL,
	"price" integer NOT NULL,
	"sale_price" integer,
	"offer_label" text,
	"offer_starts_at" timestamp with time zone,
	"offer_ends_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text NOT NULL,
	"requested_quantity" integer NOT NULL,
	"quantity_at_request" integer NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_pricing_sku_idx" ON "product_pricing" USING btree ("product_id","size");--> statement-breakpoint
CREATE INDEX "restock_status_idx" ON "restock_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "restock_sku_idx" ON "restock_requests" USING btree ("product_id","size");