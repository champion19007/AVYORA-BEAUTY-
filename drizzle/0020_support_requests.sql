CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "support_requests_status" CHECK ("support_requests"."status" IN ('open', 'answered', 'closed')),
	CONSTRAINT "support_requests_lengths" CHECK (char_length("support_requests"."name") BETWEEN 1 AND 80 AND char_length("support_requests"."message") BETWEEN 1 AND 2000 AND char_length("support_requests"."email") BETWEEN 3 AND 254)
);
--> statement-breakpoint
CREATE INDEX "support_requests_status_idx" ON "support_requests" USING btree ("status","created_at");