CREATE TABLE "kb_active_release" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"release_id" text NOT NULL,
	"previous_release_id" text,
	"activated_by" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_active_release_singleton" CHECK ("kb_active_release"."singleton")
);
--> statement-breakpoint
CREATE TABLE "kb_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"is_fixture" boolean NOT NULL,
	"status" text DEFAULT 'stored' NOT NULL,
	"manifest" jsonb NOT NULL,
	"artifacts" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"stored_by" text NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "kb_releases_status" CHECK ("kb_releases"."status" IN ('stored', 'published', 'revoked')),
	CONSTRAINT "kb_releases_revoked_reason" CHECK ("kb_releases"."status" <> 'revoked' OR ("kb_releases"."revoked_at" IS NOT NULL AND "kb_releases"."revoked_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "kb_active_release" ADD CONSTRAINT "kb_active_release_release_id_kb_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."kb_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_active_release" ADD CONSTRAINT "kb_active_release_previous_release_id_kb_releases_id_fk" FOREIGN KEY ("previous_release_id") REFERENCES "public"."kb_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_releases_status_idx" ON "kb_releases" USING btree ("status","stored_at");
--> statement-breakpoint
-- A stored release never changes; only its status moves forward.
CREATE FUNCTION "kb_releases_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'knowledge releases are retained, never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."schema_version" <> OLD."schema_version" OR NEW."is_fixture" <> OLD."is_fixture"
     OR NEW."manifest" <> OLD."manifest" OR NEW."artifacts" <> OLD."artifacts" OR NEW."checksum" <> OLD."checksum"
     OR NEW."stored_by" <> OLD."stored_by" OR NEW."stored_at" <> OLD."stored_at" THEN
    RAISE EXCEPTION 'knowledge release % is immutable', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'stored' AND NEW."status" IN ('published', 'revoked'))
    OR (OLD."status" = 'published' AND NEW."status" = 'revoked')) THEN
    RAISE EXCEPTION 'knowledge release % cannot go from % to %', OLD."id", OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "kb_releases_immutable" BEFORE UPDATE OR DELETE ON "kb_releases"
  FOR EACH ROW EXECUTE FUNCTION "kb_releases_immutable"();--> statement-breakpoint
-- The active pointer may only name a published, non-fixture release.
CREATE FUNCTION "kb_active_release_guard"() RETURNS trigger AS $$
DECLARE
  r "kb_releases"%ROWTYPE;
BEGIN
  SELECT * INTO r FROM "kb_releases" WHERE "id" = NEW."release_id";
  IF r."is_fixture" THEN
    RAISE EXCEPTION 'fixture release % cannot be activated', r."id" USING ERRCODE = 'check_violation';
  END IF;
  IF r."status" <> 'published' THEN
    RAISE EXCEPTION 'release % is %, not published', r."id", r."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "kb_active_release_guard" BEFORE INSERT OR UPDATE ON "kb_active_release"
  FOR EACH ROW EXECUTE FUNCTION "kb_active_release_guard"();--> statement-breakpoint
-- A release cannot be revoked while it is the active one: roll back first.
CREATE FUNCTION "kb_releases_revoke_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'revoked' AND OLD."status" <> 'revoked'
     AND EXISTS (SELECT 1 FROM "kb_active_release" WHERE "release_id" = NEW."id") THEN
    RAISE EXCEPTION 'release % is active; activate another release before revoking it', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "kb_releases_revoke_guard" BEFORE UPDATE OF "status" ON "kb_releases"
  FOR EACH ROW EXECUTE FUNCTION "kb_releases_revoke_guard"();
