CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"anonymous_owner_hash" text,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "consent_records_one_owner" CHECK (num_nonnulls("consent_records"."user_id", "consent_records"."anonymous_owner_hash") = 1),
	CONSTRAINT "consent_records_hash_shape" CHECK ("consent_records"."anonymous_owner_hash" IS NULL OR "consent_records"."anonymous_owner_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "consent_records_purpose" CHECK ("consent_records"."purpose" IN ('photo_processing', 'routine_saving', 'progress_photo_storage', 'model_research')),
	CONSTRAINT "consent_records_withdrawn_after_grant" CHECK ("consent_records"."withdrawn_at" IS NULL OR "consent_records"."withdrawn_at" >= "consent_records"."granted_at")
);
--> statement-breakpoint
CREATE TABLE "routine_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" text NOT NULL,
	"user_id" text NOT NULL,
	"week" smallint NOT NULL,
	"adherence" text NOT NULL,
	"tolerability" text NOT NULL,
	"reported_change" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_feedback_week" CHECK ("routine_feedback"."week" BETWEEN 1 AND 52),
	CONSTRAINT "routine_feedback_adherence" CHECK ("routine_feedback"."adherence" IN ('every_day', 'most_days', 'some_days', 'not_at_all')),
	CONSTRAINT "routine_feedback_tolerability" CHECK ("routine_feedback"."tolerability" IN ('comfortable', 'mild_discomfort', 'irritated', 'stopped')),
	CONSTRAINT "routine_feedback_change" CHECK ("routine_feedback"."reported_change" IN ('better', 'same', 'worse', 'unsure'))
);
--> statement-breakpoint
CREATE TABLE "scan_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"anonymous_owner_hash" text,
	"consent_id" uuid NOT NULL,
	"consent_purpose" text DEFAULT 'photo_processing' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"mode" text NOT NULL,
	"model_version" text,
	"quality" jsonb,
	"result" jsonb,
	"object_key" text,
	"object_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scan_sessions_one_owner" CHECK (num_nonnulls("scan_sessions"."user_id", "scan_sessions"."anonymous_owner_hash") = 1),
	CONSTRAINT "scan_sessions_hash_shape" CHECK ("scan_sessions"."anonymous_owner_hash" IS NULL OR "scan_sessions"."anonymous_owner_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "scan_sessions_consent_purpose" CHECK ("scan_sessions"."consent_purpose" = 'photo_processing'),
	CONSTRAINT "scan_sessions_status" CHECK ("scan_sessions"."status" IN ('created', 'uploaded', 'queued', 'processing', 'completed', 'failed', 'expired', 'revoked')),
	CONSTRAINT "scan_sessions_mode" CHECK ("scan_sessions"."mode" IN ('local', 'hosted')),
	CONSTRAINT "scan_sessions_expiry" CHECK ("scan_sessions"."expires_at" > "scan_sessions"."created_at" AND "scan_sessions"."expires_at" <= "scan_sessions"."created_at" + interval '7 days'),
	CONSTRAINT "scan_sessions_private_object" CHECK ("scan_sessions"."object_key" IS NULL OR (
      "scan_sessions"."mode" = 'hosted'
      AND "scan_sessions"."object_key" LIKE 'private/scans/%' AND "scan_sessions"."object_key" NOT LIKE '%..%'
      AND "scan_sessions"."object_expires_at" IS NOT NULL AND "scan_sessions"."object_expires_at" <= "scan_sessions"."created_at" + interval '24 hours'
    ))
);
--> statement-breakpoint
CREATE TABLE "skin_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"anonymous_owner_hash" text,
	"consent_id" uuid NOT NULL,
	"consent_purpose" text DEFAULT 'routine_saving' NOT NULL,
	"schema_version" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "skin_profiles_one_owner" CHECK (num_nonnulls("skin_profiles"."user_id", "skin_profiles"."anonymous_owner_hash") = 1),
	CONSTRAINT "skin_profiles_hash_shape" CHECK ("skin_profiles"."anonymous_owner_hash" IS NULL OR "skin_profiles"."anonymous_owner_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "skin_profiles_consent_purpose" CHECK ("skin_profiles"."consent_purpose" = 'routine_saving'),
	CONSTRAINT "skin_profiles_expiry" CHECK ("skin_profiles"."expires_at" > "skin_profiles"."created_at"),
	CONSTRAINT "skin_profiles_guest_expiry" CHECK ("skin_profiles"."anonymous_owner_hash" IS NULL OR "skin_profiles"."expires_at" <= "skin_profiles"."created_at" + interval '30 days'),
	CONSTRAINT "skin_profiles_schema_version" CHECK ("skin_profiles"."schema_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "anonymous_owner_hash" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "consent_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "consent_purpose" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "schema_version" integer;--> statement-breakpoint
-- Every existing row is a legacy (pre-consent) record; mark it so, then enforce.
UPDATE "routine_results" SET "schema_version" = 0;--> statement-breakpoint
ALTER TABLE "routine_results" ALTER COLUMN "schema_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "kb_release" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "engine_version" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "model_version" text;--> statement-breakpoint
ALTER TABLE "routine_results" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
-- Before the composite foreign keys that reference (id, purpose).
CREATE UNIQUE INDEX "consent_records_id_purpose_idx" ON "consent_records" USING btree ("id","purpose");--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_feedback" ADD CONSTRAINT "routine_feedback_routine_id_routine_results_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_feedback" ADD CONSTRAINT "routine_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_consent_fk" FOREIGN KEY ("consent_id","consent_purpose") REFERENCES "public"."consent_records"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_profiles" ADD CONSTRAINT "skin_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_profiles" ADD CONSTRAINT "skin_profiles_consent_fk" FOREIGN KEY ("consent_id","consent_purpose") REFERENCES "public"."consent_records"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_user_purpose_idx" ON "consent_records" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "consent_records_guest_purpose_idx" ON "consent_records" USING btree ("anonymous_owner_hash","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_one_active_user_idx" ON "consent_records" USING btree ("user_id","purpose") WHERE withdrawn_at IS NULL AND user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_one_active_guest_idx" ON "consent_records" USING btree ("anonymous_owner_hash","purpose") WHERE withdrawn_at IS NULL AND anonymous_owner_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_feedback_once_per_week_idx" ON "routine_feedback" USING btree ("routine_id","user_id","week");--> statement-breakpoint
CREATE INDEX "routine_feedback_user_idx" ON "routine_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scan_sessions_user_idx" ON "scan_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scan_sessions_guest_idx" ON "scan_sessions" USING btree ("anonymous_owner_hash","created_at");--> statement-breakpoint
CREATE INDEX "scan_sessions_expires_idx" ON "scan_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "scan_sessions_status_idx" ON "scan_sessions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "skin_profiles_user_idx" ON "skin_profiles" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "skin_profiles_guest_idx" ON "skin_profiles" USING btree ("anonymous_owner_hash","updated_at");--> statement-breakpoint
CREATE INDEX "skin_profiles_expires_idx" ON "skin_profiles" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_profile_id_skin_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."skin_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_consent_fk" FOREIGN KEY ("consent_id","consent_purpose") REFERENCES "public"."consent_records"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_results_user_created_idx" ON "routine_results" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "routine_results_guest_created_idx" ON "routine_results" USING btree ("anonymous_owner_hash","created_at");--> statement-breakpoint
CREATE INDEX "routine_results_expires_idx" ON "routine_results" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "routine_results_dedupe_idx" ON "routine_results" USING btree ("input_hash","kb_release");--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_hash_shape" CHECK ("routine_results"."anonymous_owner_hash" IS NULL OR "routine_results"."anonymous_owner_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_versioned_owner" CHECK ("routine_results"."schema_version" = 0 OR (
      num_nonnulls("routine_results"."user_id", "routine_results"."anonymous_owner_hash") = 1
      AND "routine_results"."anonymous_id" IS NULL
      AND "routine_results"."consent_id" IS NOT NULL AND "routine_results"."consent_purpose" = 'routine_saving'
      AND "routine_results"."input_hash" IS NOT NULL AND "routine_results"."engine_version" IS NOT NULL
      AND "routine_results"."expires_at" IS NOT NULL AND "routine_results"."expires_at" > "routine_results"."created_at"
      AND ("routine_results"."anonymous_owner_hash" IS NULL OR "routine_results"."expires_at" <= "routine_results"."created_at" + interval '30 days')
    ));--> statement-breakpoint
ALTER TABLE "routine_results" ADD CONSTRAINT "routine_results_legacy_shape" CHECK ("routine_results"."schema_version" >= 1 OR ("routine_results"."anonymous_owner_hash" IS NULL AND "routine_results"."consent_id" IS NULL));
--> statement-breakpoint
-- A record that needs consent may only be created (and a scan may only
-- advance) under a consent that is active and belongs to the same owner.
CREATE FUNCTION "require_active_consent"() RETURNS trigger AS $$
DECLARE
  rec jsonb := to_jsonb(NEW);
  c "consent_records"%ROWTYPE;
BEGIN
  IF rec->>'consent_id' IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM "consent_records" WHERE "id" = (rec->>'consent_id')::uuid;
  IF c."withdrawn_at" IS NOT NULL THEN
    RAISE EXCEPTION 'consent % has been withdrawn', c."id" USING ERRCODE = 'check_violation';
  END IF;
  IF c."user_id" IS DISTINCT FROM rec->>'user_id'
     OR c."anonymous_owner_hash" IS DISTINCT FROM rec->>'anonymous_owner_hash' THEN
    RAISE EXCEPTION 'consent % belongs to a different owner', c."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "skin_profiles_require_consent" BEFORE INSERT ON "skin_profiles"
  FOR EACH ROW EXECUTE FUNCTION "require_active_consent"();--> statement-breakpoint
CREATE TRIGGER "routine_results_require_consent" BEFORE INSERT ON "routine_results"
  FOR EACH ROW EXECUTE FUNCTION "require_active_consent"();--> statement-breakpoint
CREATE TRIGGER "scan_sessions_require_consent" BEFORE INSERT ON "scan_sessions"
  FOR EACH ROW EXECUTE FUNCTION "require_active_consent"();--> statement-breakpoint
CREATE TRIGGER "scan_sessions_progress_requires_consent" BEFORE UPDATE OF "status" ON "scan_sessions"
  FOR EACH ROW WHEN (NEW."status" IN ('uploaded', 'queued', 'processing', 'completed'))
  EXECUTE FUNCTION "require_active_consent"();--> statement-breakpoint
-- A consent record is append-only: it may be withdrawn once, never edited,
-- reassigned or re-granted (a new grant is a new row).
CREATE FUNCTION "consent_records_append_only"() RETURNS trigger AS $$
BEGIN
  IF OLD."withdrawn_at" IS NOT NULL
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."anonymous_owner_hash" IS DISTINCT FROM OLD."anonymous_owner_hash"
     OR NEW."purpose" <> OLD."purpose"
     OR NEW."policy_version" <> OLD."policy_version"
     OR NEW."granted_at" <> OLD."granted_at" THEN
    RAISE EXCEPTION 'consent records can only be withdrawn, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "consent_records_append_only" BEFORE UPDATE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION "consent_records_append_only"();--> statement-breakpoint
-- Withdrawing photo-processing consent stops queued work and suppresses
-- results at once. The private object stays referenced (object_key) so the
-- deletion worker can remove it; nothing new may be done with it.
CREATE FUNCTION "revoke_scans_on_withdrawal"() RETURNS trigger AS $$
BEGIN
  UPDATE "scan_sessions"
     SET "status" = 'revoked', "result" = NULL, "quality" = NULL
   WHERE "consent_id" = NEW."id" AND "status" NOT IN ('failed', 'expired', 'revoked');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "consent_records_revoke_scans" AFTER UPDATE OF "withdrawn_at" ON "consent_records"
  FOR EACH ROW WHEN (OLD."withdrawn_at" IS NULL AND NEW."withdrawn_at" IS NOT NULL)
  EXECUTE FUNCTION "revoke_scans_on_withdrawal"();
