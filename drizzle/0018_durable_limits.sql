CREATE TABLE "scan_admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_session_id" uuid,
	"user_id" text,
	"anonymous_owner_hash" text,
	"ip_key" text,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_admissions_one_owner" CHECK (num_nonnulls("scan_admissions"."user_id", "scan_admissions"."anonymous_owner_hash") = 1)
);
--> statement-breakpoint
CREATE TABLE "scan_attempts" (
	"scan_session_id" uuid NOT NULL,
	"attempt" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_attempts_scan_session_id_attempt_pk" PRIMARY KEY("scan_session_id","attempt"),
	CONSTRAINT "scan_attempts_budget" CHECK ("scan_attempts"."attempt" BETWEEN 1 AND 2)
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ADD COLUMN "window_seconds" integer;--> statement-breakpoint
ALTER TABLE "scan_admissions" ADD CONSTRAINT "scan_admissions_scan_session_id_scan_sessions_id_fk" FOREIGN KEY ("scan_session_id") REFERENCES "public"."scan_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_admissions" ADD CONSTRAINT "scan_admissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_attempts" ADD CONSTRAINT "scan_attempts_scan_session_id_scan_sessions_id_fk" FOREIGN KEY ("scan_session_id") REFERENCES "public"."scan_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_admissions_user_idx" ON "scan_admissions" USING btree ("user_id","admitted_at");--> statement-breakpoint
CREATE INDEX "scan_admissions_guest_idx" ON "scan_admissions" USING btree ("anonymous_owner_hash","admitted_at");--> statement-breakpoint
CREATE INDEX "scan_admissions_ip_idx" ON "scan_admissions" USING btree ("ip_key","admitted_at");--> statement-breakpoint
CREATE INDEX "scan_admissions_admitted_idx" ON "scan_admissions" USING btree ("admitted_at");--> statement-breakpoint
CREATE INDEX "scan_attempts_started_idx" ON "scan_attempts" USING btree ("started_at");