CREATE TABLE "environmental_cache" (
	"region" text PRIMARY KEY NOT NULL,
	"uv_index" integer,
	"humidity" integer,
	"pm25" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"ingredient_a" text NOT NULL,
	"ingredient_b" text NOT NULL,
	"tier" integer NOT NULL,
	"summary" text NOT NULL,
	"advice" text NOT NULL,
	"citation" text
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"inci_name" text NOT NULL,
	"common_name" text NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prescription_only" boolean DEFAULT false NOT NULL,
	"pregnancy_caution" boolean DEFAULT false NOT NULL,
	"photosensitising" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"ingredient_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prescribed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_interactions" ADD CONSTRAINT "ingredient_interactions_ingredient_a_ingredients_id_fk" FOREIGN KEY ("ingredient_a") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_interactions" ADD CONSTRAINT "ingredient_interactions_ingredient_b_ingredients_id_fk" FOREIGN KEY ("ingredient_b") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_pair_idx" ON "ingredient_interactions" USING btree ("ingredient_a","ingredient_b");--> statement-breakpoint
CREATE INDEX "ingredients_inci_idx" ON "ingredients" USING btree ("inci_name");--> statement-breakpoint
CREATE INDEX "routine_items_user_idx" ON "routine_items" USING btree ("user_id");