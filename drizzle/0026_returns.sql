CREATE TABLE "return_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"items" jsonb NOT NULL,
	"customer_note" text,
	"refund_to" text,
	"refund_amount" integer,
	"refund_method" text,
	"refund_reference" text,
	"refund_status" text,
	"restocked_units" integer DEFAULT 0 NOT NULL,
	"staff_note" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "return_requests_kind_check" CHECK ("return_requests"."kind" in ('unopened', 'damaged', 'wrong_item', 'cancelled', 'undelivered')),
	CONSTRAINT "return_requests_status_check" CHECK ("return_requests"."status" in ('requested', 'approved', 'rejected', 'received', 'refunded'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_requests_order_idx" ON "return_requests" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_requests_one_open_idx" ON "return_requests" USING btree ("order_id") WHERE "return_requests"."status" in ('requested', 'approved', 'received');--> statement-breakpoint
-- Orders delivered before this column existed: their last update is the best record of when.
UPDATE "orders" SET "delivered_at" = "updated_at" WHERE "status" = 'delivered' AND "delivered_at" IS NULL;
