import { desc } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { compileRelease, type CompiledRelease } from './compile';
import { productionInput } from './production-input';
import {
  activateRelease,
  revokeRelease,
  rollbackRelease,
  storeRelease,
  type Actor,
  type ReleaseCommandResult,
} from './releases';

/**
 * Knowledge operations for the staff console.
 *
 * Authoring happens in the repository: knowledge records are reviewed data
 * in `src/data/*` (rules, templates, directions, formulations, reviews), so
 * every change is a reviewable diff. This module validates what the
 * repository holds, and stores, publishes, rolls back and revokes immutable
 * releases through `releases.ts` (row locks, checksums, audit records).
 * Publishing and revoking are owner-only; managers can read.
 */

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type StaffActor = Actor & { role: 'owner' | 'manager' };

export type Validation =
  | { ok: true; release: CompiledRelease; awaitingReview: string[] }
  | { ok: false; errors: string[]; awaitingReview: string[] };

/** Compiles the repository's approved knowledge; errors name the record they concern. */
export function validateRepositoryKnowledge(): Validation {
  const { input, awaitingReview } = productionInput();
  const compiled = compileRelease(input, { fixture: false });
  return compiled.ok
    ? { ok: true, release: compiled.release, awaitingReview }
    : { ok: false, errors: compiled.errors, awaitingReview };
}

const ownerOnly = (actor: StaffActor, what: string): ReleaseCommandResult | null =>
  actor.role === 'owner' ? null : { ok: false, error: `Only the owner can ${what}.` };

/** Stores the validated release (idempotent) and makes it active. Refused when validation fails. */
export async function publishRepositoryRelease(db: Db, actor: StaffActor): Promise<ReleaseCommandResult> {
  const refused = ownerOnly(actor, 'publish knowledge');
  if (refused) return refused;
  const v = validateRepositoryKnowledge();
  if (!v.ok)
    return {
      ok: false,
      error: `Knowledge does not validate (${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}): ${v.errors.slice(0, 5).join('; ')}`,
    };
  const stored = await storeRelease(db, v.release, actor);
  if (!stored.ok) return stored;
  return activateRelease(db, v.release.manifest.releaseId, actor);
}

export async function rollbackKnowledge(db: Db, actor: StaffActor, reason: string): Promise<ReleaseCommandResult> {
  const refused = ownerOnly(actor, 'roll back knowledge');
  if (refused) return refused;
  if (!reason.trim()) return { ok: false, error: 'A reason is required to roll back.' };
  return rollbackRelease(db, actor, reason.trim());
}

export async function revokeKnowledge(
  db: Db,
  actor: StaffActor,
  releaseId: string,
  reason: string
): Promise<ReleaseCommandResult> {
  const refused = ownerOnly(actor, 'revoke a release');
  if (refused) return refused;
  return revokeRelease(db, releaseId, actor, reason.trim());
}

/** Stored releases, newest first, and which one is active. */
export async function listReleases(db: Db) {
  const [rows, [active]] = await Promise.all([
    db
      .select({
        id: schema.kbReleases.id,
        status: schema.kbReleases.status,
        isFixture: schema.kbReleases.isFixture,
        storedBy: schema.kbReleases.storedBy,
        storedAt: schema.kbReleases.storedAt,
        publishedAt: schema.kbReleases.publishedAt,
        revokedAt: schema.kbReleases.revokedAt,
        revokedReason: schema.kbReleases.revokedReason,
      })
      .from(schema.kbReleases)
      .orderBy(desc(schema.kbReleases.storedAt))
      .limit(50),
    db.select().from(schema.kbActiveRelease),
  ]);
  return { releases: rows, activeId: active?.releaseId ?? null, previousId: active?.previousReleaseId ?? null };
}
