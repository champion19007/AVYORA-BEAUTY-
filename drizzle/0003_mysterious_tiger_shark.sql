ALTER TABLE "addresses" ADD COLUMN "landmark" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;