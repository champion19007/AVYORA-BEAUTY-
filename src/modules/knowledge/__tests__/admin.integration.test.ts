import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/*
 * Staff knowledge operations on real migrations: role checks, publication
 * of the repository's approved knowledge, refusal when validation fails,
 * rollback and revocation through immutable releases.
 */
const { client, db } = await createMigratedDb();
const productionInputMock = vi.hoisted(() => ({ override: null as null | ((i: any) => any) })); // eslint-disable-line @typescript-eslint/no-explicit-any
vi.mock('../production-input', async (importOriginal) => {
  const real = await importOriginal<typeof import('../production-input')>();
  return {
    productionInput: () => {
      const out = real.productionInput();
      return productionInputMock.override ? { ...out, input: productionInputMock.override(out.input) } : out;
    },
  };
});
const { listReleases, publishRepositoryRelease, revokeKnowledge, rollbackKnowledge, validateRepositoryKnowledge } = await import('../admin');

const owner = { id: 'owner-1', role: 'owner' as const };
const manager = { id: 'manager-1', role: 'manager' as const };

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  productionInputMock.override = null;
  // Releases are immutable by trigger; reset the tables for each test.
  await db.execute(sql`alter table kb_releases disable trigger user`);
  await db.execute(sql`truncate kb_active_release, kb_releases, audit_logs`);
  await db.execute(sql`alter table kb_releases enable trigger user`);
});

/** A second, distinct release: the same knowledge plus one test-only evidence record. */
const withTestEvidence = (id: string) => (input: any) => ({ ...input, evidence: [...input.evidence, { id, title: 'Test only', url: null, sourceType: 'label', retrievedAt: '2026-01-01', limitations: 'Test' }] }); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('knowledge operations', () => {
  it('validates the repository knowledge and lists what still awaits review', () => {
    const v = validateRepositoryKnowledge();
    expect(v.ok).toBe(true);
    expect(v.awaitingReview.some((x) => x.startsWith('decision rule'))).toBe(true);
  });

  it('a manager can read but cannot publish, roll back or revoke', async () => {
    expect(await publishRepositoryRelease(db, manager)).toEqual({ ok: false, error: 'Only the owner can publish knowledge.' });
    expect((await rollbackKnowledge(db, manager, 'x')).ok).toBe(false);
    expect((await revokeKnowledge(db, manager, 'kb_x', 'x')).ok).toBe(false);
    expect((await listReleases(db)).releases).toEqual([]);
  });

  it('the owner publishes; publishing again is idempotent; every step is audited', async () => {
    const first = await publishRepositoryRelease(db, owner);
    expect(first.ok).toBe(true);
    expect(await publishRepositoryRelease(db, owner)).toEqual(first);
    const { releases, activeId } = await listReleases(db);
    expect(releases).toHaveLength(1);
    expect(activeId).toBe(first.ok && first.releaseId);
    const actions = (await db.select({ action: schema.auditLogs.action }).from(schema.auditLogs)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['knowledge.release_stored', 'knowledge.release_activated']));
  });

  it('refuses to publish knowledge that does not validate, naming the record', async () => {
    // A draft safety rule slipped in as if approved, without a reviewer: compile must reject it.
    productionInputMock.override = (input) => ({ ...input, interactions: [...input.interactions, { a: 'retinol', b: 'no-such-ingredient', tier: 2, summary: 'x', advice: 'x', citation: null, review: { status: 'approved', reviewerId: 'x', reviewedAt: '2026-01-01', sourceIds: ['missing-source'] } }] });
    const result = await publishRepositoryRelease(db, owner);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/interaction retinol\/no-such-ingredient/);
    expect((await listReleases(db)).releases).toEqual([]);
  });

  it('rollback needs a reason and restores the previous release; the active one cannot be revoked', async () => {
    const a = await publishRepositoryRelease(db, owner);
    productionInputMock.override = withTestEvidence('test-evidence-b');
    const b = await publishRepositoryRelease(db, owner);
    expect(a.ok && b.ok && a.releaseId !== b.releaseId).toBe(true);
    expect((await rollbackKnowledge(db, owner, '  ')).ok).toBe(false);
    expect((await revokeKnowledge(db, owner, (b as { releaseId: string }).releaseId, 'bad')).ok).toBe(false);
    expect(await rollbackKnowledge(db, owner, 'testing rollback')).toMatchObject({ ok: true, releaseId: (a as { releaseId: string }).releaseId });
    expect(await revokeKnowledge(db, owner, (b as { releaseId: string }).releaseId, 'superseded in test')).toMatchObject({ ok: true });
    const { releases, activeId } = await listReleases(db);
    expect(activeId).toBe((a as { releaseId: string }).releaseId);
    expect(releases.find((r) => r.id === (b as { releaseId: string }).releaseId)?.status).toBe('revoked');
  });
});
