CREATE TABLE "routine_schedule_slots" (
	"routine_id" text NOT NULL,
	"day" smallint NOT NULL,
	"session" text NOT NULL,
	"position" smallint NOT NULL,
	"role" text NOT NULL,
	"optional" boolean NOT NULL,
	"product_id" text,
	"sku_id" text,
	"owned_item_id" text,
	CONSTRAINT "routine_schedule_slots_routine_id_day_session_position_pk" PRIMARY KEY("routine_id","day","session","position"),
	CONSTRAINT "routine_schedule_slots_day" CHECK ("routine_schedule_slots"."day" BETWEEN 1 AND 7),
	CONSTRAINT "routine_schedule_slots_session" CHECK ("routine_schedule_slots"."session" IN ('am', 'pm')),
	CONSTRAINT "routine_schedule_slots_position" CHECK ("routine_schedule_slots"."position" BETWEEN 1 AND 10),
	CONSTRAINT "routine_schedule_slots_item" CHECK (("routine_schedule_slots"."product_id" IS NOT NULL AND "routine_schedule_slots"."sku_id" IS NOT NULL AND "routine_schedule_slots"."owned_item_id" IS NULL)
      OR ("routine_schedule_slots"."product_id" IS NULL AND "routine_schedule_slots"."sku_id" IS NULL AND "routine_schedule_slots"."owned_item_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "inference_version" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "routine_schedule_slots" ADD CONSTRAINT "routine_schedule_slots_routine_id_routine_results_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_results_user_idempotency_idx" ON "routine_results" USING btree ("user_id","idempotency_key") WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_results_guest_idempotency_idx" ON "routine_results" USING btree ("anonymous_owner_hash","idempotency_key") WHERE anonymous_owner_hash IS NOT NULL AND idempotency_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_idempotency_pair" CHECK (("routine_results"."idempotency_key" IS NULL) = ("routine_results"."request_hash" IS NULL));