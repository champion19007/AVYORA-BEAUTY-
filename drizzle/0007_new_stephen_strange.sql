ALTER TYPE "public"."order_status" ADD VALUE 'returned';--> statement-breakpoint
CREATE TABLE "consumer_registrations" (
	"consumer" text PRIMARY KEY NOT NULL,
	"start_event_id" integer DEFAULT 0 NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_deliveries" (
	"event_id" integer NOT NULL,
	"consumer" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_deliveries_event_id_consumer_pk" PRIMARY KEY("event_id","consumer")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fraud_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fraud_score" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fraud_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_events_name_idx" ON "domain_events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "domain_events_created_idx" ON "domain_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_deliveries_consumer_idx" ON "event_deliveries" USING btree ("consumer","status");--> statement-breakpoint
-- The consumers that ship with the log start at zero, so nothing that already
-- exists is skipped on a fresh database. A consumer added later registers
-- itself at the head instead: it is not responsible for last month's orders.
INSERT INTO "consumer_registrations" ("consumer", "start_event_id") VALUES
	('notifications', 0),
	('cod-risk', 0),
	('revalidate', 0)
ON CONFLICT ("consumer") DO NOTHING;
