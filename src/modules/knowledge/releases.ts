/**
 * Storing, activating, rolling back and revoking knowledge releases.
 *
 * The active release is one row (`kb_active_release`), replaced inside the
 * same transaction as the release's status change and its audit record, with
 * the row locked so two activations cannot interleave. Every activation
 * re-verifies the stored artifacts against their checksums first; a release
 * that no longer matches its manifest is never made active. The database
 * also refuses fixture or revoked releases on the pointer and edits to a
 * stored release. Server-only.
 */
import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit';
import { canonicalJson, sha256, verifyRelease, type ArtifactName, type CompiledRelease, type Manifest } from './compile';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Actor = { id: string; role: string };

export type ReleaseCommandResult = { ok: true; releaseId: string } | { ok: false; error: string };

const asCompiled = (row: typeof schema.kbReleases.$inferSelect): CompiledRelease => ({
  manifest: row.manifest as Manifest,
  artifacts: row.artifacts as Record<ArtifactName, string>,
});

/** Stores a compiled release. Storing the same release twice is a no-op. */
export async function storeRelease(db: Db, release: CompiledRelease, actor: Actor): Promise<ReleaseCommandResult> {
  const problems = verifyRelease(release);
  if (problems.length) return { ok: false, error: `Release is not intact: ${problems.join('; ')}` };
  const { manifest } = release;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.kbReleases)
      .values({
        id: manifest.releaseId,
        schemaVersion: manifest.schemaVersion,
        isFixture: manifest.fixture,
        manifest,
        artifacts: release.artifacts,
        checksum: sha256(canonicalJson(manifest)),
        storedBy: actor.id,
      })
      .onConflictDoNothing()
      .returning({ id: schema.kbReleases.id });
    if (inserted.length) {
      await recordAudit(
        { actor: actor.id, actorRole: actor.role, action: 'knowledge.release_stored', entityType: 'kb_release', entityId: manifest.releaseId, after: { fixture: manifest.fixture } },
        tx as never
      );
    }
  });
  return { ok: true, releaseId: manifest.releaseId };
}

async function activate(db: Db, releaseId: string, actor: Actor, action: string, reason?: string): Promise<ReleaseCommandResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(schema.kbActiveRelease).for('update');
    const [row] = await tx.select().from(schema.kbReleases).where(eq(schema.kbReleases.id, releaseId));
    if (!row) return { ok: false as const, error: `No release ${releaseId}` };
    if (row.isFixture) return { ok: false as const, error: `Release ${releaseId} is a development fixture and cannot be activated` };
    if (row.status === 'revoked') return { ok: false as const, error: `Release ${releaseId} has been revoked` };
    const problems = verifyRelease(asCompiled(row));
    if (problems.length) return { ok: false as const, error: `Release ${releaseId} is not intact: ${problems.join('; ')}` };
    if (current?.releaseId === releaseId) return { ok: true as const, releaseId };

    if (row.status === 'stored') {
      await tx.update(schema.kbReleases).set({ status: 'published', publishedAt: new Date() }).where(eq(schema.kbReleases.id, releaseId));
    }
    const pointer = { releaseId, previousReleaseId: current?.releaseId ?? null, activatedBy: actor.id, activatedAt: new Date() };
    if (current) await tx.update(schema.kbActiveRelease).set(pointer).where(eq(schema.kbActiveRelease.singleton, true));
    else await tx.insert(schema.kbActiveRelease).values(pointer);

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action,
        entityType: 'kb_release',
        entityId: releaseId,
        before: { activeReleaseId: current?.releaseId ?? null },
        after: { activeReleaseId: releaseId },
        reason,
      },
      tx as never
    );
    return { ok: true as const, releaseId };
  });
}

/** Makes a stored or published release the active one. */
export function activateRelease(db: Db, releaseId: string, actor: Actor): Promise<ReleaseCommandResult> {
  return activate(db, releaseId, actor, 'knowledge.release_activated');
}

/** Re-activates the release that was active before the current one. */
export async function rollbackRelease(db: Db, actor: Actor, reason: string): Promise<ReleaseCommandResult> {
  const [current] = await db.select().from(schema.kbActiveRelease);
  if (!current?.previousReleaseId) return { ok: false, error: 'There is no previous release to roll back to' };
  return activate(db, current.previousReleaseId, actor, 'knowledge.release_rolled_back', reason);
}

/** Revokes a release. The active release must be replaced (activate or roll back) first. */
export async function revokeRelease(db: Db, releaseId: string, actor: Actor, reason: string): Promise<ReleaseCommandResult> {
  if (!reason.trim()) return { ok: false, error: 'A reason is required to revoke a release' };
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(schema.kbActiveRelease).for('update');
    if (current?.releaseId === releaseId) {
      return { ok: false as const, error: 'This release is active; roll back or activate another release first' };
    }
    const updated = await tx
      .update(schema.kbReleases)
      .set({ status: 'revoked', revokedAt: new Date(), revokedReason: reason })
      .where(eq(schema.kbReleases.id, releaseId))
      .returning({ id: schema.kbReleases.id });
    if (!updated.length) return { ok: false as const, error: `No release ${releaseId}` };
    await recordAudit(
      { actor: actor.id, actorRole: actor.role, action: 'knowledge.release_revoked', entityType: 'kb_release', entityId: releaseId, reason },
      tx as never
    );
    return { ok: true as const, releaseId };
  });
}

/** The active release with its artifacts parsed, verified on every read; null when none is active. */
export async function loadActiveRelease(db: Db) {
  const [row] = await db
    .select({ release: schema.kbReleases })
    .from(schema.kbActiveRelease)
    .innerJoin(schema.kbReleases, eq(schema.kbReleases.id, schema.kbActiveRelease.releaseId));
  if (!row) return null;
  const compiled = asCompiled(row.release);
  const problems = verifyRelease(compiled);
  if (problems.length) throw new Error(`Active knowledge release ${row.release.id} is not intact: ${problems.join('; ')}`);
  return {
    manifest: compiled.manifest,
    artifacts: Object.fromEntries(Object.entries(compiled.artifacts).map(([k, v]) => [k, JSON.parse(v)])) as Record<ArtifactName, unknown>,
  };
}

/** Whether a release may still be used for new saves: it exists and is not revoked. */
export async function releaseUsable(db: Db, releaseId: string): Promise<boolean> {
  const [row] = await db.select({ status: schema.kbReleases.status }).from(schema.kbReleases).where(eq(schema.kbReleases.id, releaseId));
  return row !== undefined && row.status !== 'revoked';
}
