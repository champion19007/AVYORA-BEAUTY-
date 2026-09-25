CREATE TABLE "wishlist_items" (
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One cart per person. Duplicates can only exist from the find-or-create race
-- this index closes; if any are present, keep each person's most recently
-- updated cart. Carts mirror the browser's bag, which re-sends its contents
-- on the next change, so an older duplicate holds nothing the customer loses.
DELETE FROM "carts" c USING "carts" newer
WHERE c."user_id" IS NOT NULL AND c."user_id" = newer."user_id"
  AND (c."updated_at", c."id") < (newer."updated_at", newer."id");--> statement-breakpoint
DELETE FROM "carts" c USING "carts" newer
WHERE c."anonymous_id" IS NOT NULL AND c."anonymous_id" = newer."anonymous_id"
  AND (c."updated_at", c."id") < (newer."updated_at", newer."id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_user_unique" ON "carts" USING btree ("user_id") WHERE "carts"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "carts_anon_unique" ON "carts" USING btree ("anonymous_id") WHERE "carts"."anonymous_id" is not null;