ALTER TABLE "orders" ADD COLUMN "awb" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipment" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_awb_idx" ON "orders" USING btree ("awb");