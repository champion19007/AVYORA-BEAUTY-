import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createMigratedDb } from '@/test/migrated-db';
import * as schema from '@/db/schema';
import { compileRelease, type CompiledRelease } from '../compile';
import { productionInput } from '../production-input';
import { developmentFixtureInput } from '../__fixtures__/development-fixture';
import {
  activateRelease,
  loadActiveRelease,
  releaseUsable,
  revokeRelease,
  rollbackRelease,
  storeRelease,
} from '../releases';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const owner = { id: 'owner-1', role: 'owner' };

const compiled = (fixture: boolean, extraEvidence?: string): CompiledRelease => {
  const input = fixture ? developmentFixtureInput() : productionInput().input;
  // A second, distinct production release for rollback tests: the same
  // knowledge plus one test evidence record (this test database only).
  if (extraEvidence) {
    input.evidence = [
      ...input.evidence,
      {
        id: extraEvidence,
        title: 'Test only',
        url: null,
        sourceType: 'label',
        retrievedAt: '2026-01-01',
        limitations: 'Test',
      },
    ];
  }
  const r = compileRelease(input, { fixture });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.release;
};

const A = compiled(false);
const B = compiled(false, 'test-evidence-b');
const FIXTURE = compiled(true);
const active = async () => (await ctx.db.select().from(schema.kbActiveRelease))[0];
const q = (text: string, params: unknown[] = []) => ctx.client.query(text, params);

beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});

describe('knowledge releases', () => {
  it('stores releases idempotently, verified', async () => {
    expect(A.manifest.releaseId).not.toBe(B.manifest.releaseId);
    for (const r of [A, B, FIXTURE])
      expect(await storeRelease(ctx.db as never, r, owner)).toEqual({ ok: true, releaseId: r.manifest.releaseId });
    expect(await storeRelease(ctx.db as never, A, owner)).toMatchObject({ ok: true });
    expect(await ctx.db.select().from(schema.kbReleases)).toHaveLength(3);
  });

  it('refuses to store a release whose artifacts do not match the manifest', async () => {
    const broken = { ...A, artifacts: { ...A.artifacts, evidence: '{"sources":[]} ' } };
    expect(await storeRelease(ctx.db as never, broken, owner)).toMatchObject({ ok: false });
  });

  it('never activates a development fixture', async () => {
    expect(await activateRelease(ctx.db as never, FIXTURE.manifest.releaseId, owner)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/development fixture/),
    });
    // Nor can the pointer be set directly.
    await expect(
      q(`INSERT INTO kb_active_release (release_id, activated_by) VALUES ($1, 'x')`, [FIXTURE.manifest.releaseId])
    ).rejects.toThrow(/cannot be activated/);
    expect(await active()).toBeUndefined();
  });

  it('activates, then switches the pointer atomically and remembers the previous release', async () => {
    expect(await activateRelease(ctx.db as never, A.manifest.releaseId, owner)).toMatchObject({ ok: true });
    expect(await active()).toMatchObject({ releaseId: A.manifest.releaseId, previousReleaseId: null });
    expect(await activateRelease(ctx.db as never, B.manifest.releaseId, owner)).toMatchObject({ ok: true });
    expect(await active()).toMatchObject({ releaseId: B.manifest.releaseId, previousReleaseId: A.manifest.releaseId });
    const loaded = await loadActiveRelease(ctx.db as never);
    expect(loaded?.manifest.releaseId).toBe(B.manifest.releaseId);
    expect((loaded?.artifacts.evidence as { sources: { id: string }[] }).sources.map((s) => s.id)).toContain(
      'test-evidence-b'
    );
  });

  it('rolls back to the previous release', async () => {
    expect(await rollbackRelease(ctx.db as never, owner, 'test rollback')).toMatchObject({
      ok: true,
      releaseId: A.manifest.releaseId,
    });
    expect(await active()).toMatchObject({ releaseId: A.manifest.releaseId, previousReleaseId: B.manifest.releaseId });
  });

  it('will not revoke the active release; revokes another, which can then never be activated', async () => {
    expect(await revokeRelease(ctx.db as never, A.manifest.releaseId, owner, 'test')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/active/),
    });
    await expect(
      q(`UPDATE kb_releases SET status = 'revoked', revoked_at = now(), revoked_reason = 'x' WHERE id = $1`, [
        A.manifest.releaseId,
      ])
    ).rejects.toThrow(/is active/);

    expect(await revokeRelease(ctx.db as never, B.manifest.releaseId, owner, 'found a problem')).toMatchObject({
      ok: true,
    });
    expect(await releaseUsable(ctx.db as never, B.manifest.releaseId)).toBe(false);
    expect(await activateRelease(ctx.db as never, B.manifest.releaseId, owner)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/revoked/),
    });
    expect(await rollbackRelease(ctx.db as never, owner, 'x')).toMatchObject({ ok: false });
    expect(await revokeRelease(ctx.db as never, A.manifest.releaseId, owner, '')).toMatchObject({ ok: false });
  });

  it('keeps every release immutable and retained', async () => {
    const id = A.manifest.releaseId;
    await expect(q(`UPDATE kb_releases SET artifacts = '{}' WHERE id = $1`, [id])).rejects.toThrow(/immutable/);
    await expect(q(`UPDATE kb_releases SET checksum = 'x' WHERE id = $1`, [id])).rejects.toThrow(/immutable/);
    await expect(q(`UPDATE kb_releases SET status = 'stored' WHERE id = $1`, [id])).rejects.toThrow(
      /cannot go from published to stored/
    );
    await expect(q(`DELETE FROM kb_releases WHERE id = $1`, [B.manifest.releaseId])).rejects.toThrow(/never deleted/);
  });

  it('refuses to load or activate a release whose stored bytes were altered', async () => {
    const id = A.manifest.releaseId;
    await ctx.client.exec(`ALTER TABLE kb_releases DISABLE TRIGGER kb_releases_immutable`);
    await q(`UPDATE kb_releases SET artifacts = jsonb_set(artifacts, '{rules}', '"{\\"rules\\":[]} "') WHERE id = $1`, [
      id,
    ]);
    await ctx.client.exec(`ALTER TABLE kb_releases ENABLE TRIGGER kb_releases_immutable`);
    await expect(loadActiveRelease(ctx.db as never)).rejects.toThrow(/not intact/);
  });

  it('records an audit entry for every change', async () => {
    const rows = await ctx.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityType, 'kb_release'));
    const actions = rows.map((r) => r.action);
    expect(actions.filter((a) => a === 'knowledge.release_stored')).toHaveLength(3);
    expect(actions).toContain('knowledge.release_activated');
    expect(actions).toContain('knowledge.release_rolled_back');
    expect(actions).toContain('knowledge.release_revoked');
  });
});
