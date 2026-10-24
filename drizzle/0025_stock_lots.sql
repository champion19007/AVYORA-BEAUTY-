CREATE TABLE "order_item_lots" (
	"order_item_id" integer NOT NULL,
	"lot_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_item_lots_order_item_id_lot_id_pk" PRIMARY KEY("order_item_id","lot_id")
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text NOT NULL,
	"batch_code" text NOT NULL,
	"expires_on" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"expired_units" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" text,
	CONSTRAINT "stock_lots_quantity_check" CHECK ("stock_lots"."quantity" >= 0 AND "stock_lots"."expired_units" >= 0),
	CONSTRAINT "stock_lots_expiry_check" CHECK ("stock_lots"."expires_on" IS NULL OR "stock_lots"."expires_on" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_lots_lot_idx" ON "order_item_lots" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_lots_sku_batch_idx" ON "stock_lots" USING btree ("product_id","size","batch_code");--> statement-breakpoint
-- Stock already on the shelf has no recorded batch. It gets one, so every SKU
-- with stock is batch-tracked from here on and the totals still add up.
INSERT INTO "stock_lots" ("product_id", "size", "batch_code", "quantity", "received_by")
SELECT "product_id", "size", 'NOT-RECORDED', "quantity", 'migration' FROM "inventory" WHERE "quantity" > 0;
