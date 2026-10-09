CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_version" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "newsletter_status" CHECK ("newsletter_subscribers"."status" IN ('pending', 'subscribed', 'unsubscribed')),
	CONSTRAINT "newsletter_email" CHECK (char_length("newsletter_subscribers"."email") BETWEEN 3 AND 254 AND "newsletter_subscribers"."email" = lower("newsletter_subscribers"."email")),
	CONSTRAINT "newsletter_token_hash" CHECK ("newsletter_subscribers"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_email_idx" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_token_idx" ON "newsletter_subscribers" USING btree ("token_hash");