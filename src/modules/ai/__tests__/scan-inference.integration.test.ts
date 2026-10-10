import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import type { Owner } from '@/lib/guest-owner';

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { PermanentJobError } = await import('@/infrastructure/jobs/queue');
const { grantConsent, withdrawConsent } = await import('@/modules/personal/personal-records');
const { localPrivateStorage } = await import('@/modules/scans/private-storage');
const { createHostedScan, uploadScanImage } = await import('@/modules/scans/sessions');
const { requestScanInference, skinAnalysisJobHandler, MAX_PENDING_SCANS } = await import('../skin-analysis');

const alice: Owner = { kind: 'user', userId: 'u-alice' };
const store = localPrivateStorage(mkdtempSync(path.join(tmpdir(), 'infer-store-')));
/** Whether any private object for this scan remains (uploads use per-request staged keys). */
const stored = async (id: string) => (await store.list()).some((o) => o.key.startsWith(`private/scans/${id}`));
const MODEL = 'test-model-1';
const valid = {
  observations: [
    {
      schemaVersion: 1,
      concern: 'shine_appearance',
      state: 'medium',
      source: 'vision',
      evidenceGroup: 'shine',
      quality: 'accepted',
      modelVersion: MODEL,
    },
  ],
};
const model = (analyze: (img: Uint8Array, signal: AbortSignal) => Promise<unknown>) => ({
  modelVersion: MODEL,
  analyze: vi.fn(analyze),
});
const handler = (analyzer: ReturnType<typeof model> | null) =>
  skinAnalysisJobHandler({ analyzer: () => analyzer, storage: () => store });
const statusOf = async (id: string) =>
  (
    await client.query<{ status: string; object_key: string | null; result: unknown }>(
      'SELECT status, object_key, result FROM scan_sessions WHERE id = $1',
      [id]
    )
  ).rows[0];

beforeAll(async () => {
  await client.exec(`INSERT INTO users (id, email) VALUES ('u-alice', 'a@example.test')`);
}, 60_000);
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate jobs restart identity`);
  await client.exec(
    `DELETE FROM scan_attempts; DELETE FROM scan_admissions; DELETE FROM scan_sessions; DELETE FROM consent_records;`
  );
});

/** A scan with an uploaded photo, as the upload route leaves it. */
async function uploaded() {
  await grantConsent(db as never, alice, 'photo_processing', 'p1');
  const created = await createHostedScan(db as never, alice, null);
  if (!created.ok) throw new Error(created.code);
  const jpeg = new Uint8Array(
    await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 110, b: 100 } } })
      .jpeg()
      .toBuffer()
  );
  await uploadScanImage(db as never, store, alice, created.id, jpeg);
  return created.id;
}

describe('scan inference (disabled today)', () => {
  it('queues nothing while no model is configured', async () => {
    const id = await uploaded();
    expect(await requestScanInference(alice, id)).toEqual({ ok: false, code: 'model_unavailable' });
    expect((await statusOf(id)).status).toBe('uploaded');
    expect((await client.query('SELECT 1 FROM jobs')).rows).toHaveLength(0);
  });

  it('a job that runs without a model fails the scan and deletes the photo', async () => {
    const id = await uploaded();
    await client.query(`UPDATE scan_sessions SET status = 'queued' WHERE id = $1`, [id]);
    await expect(handler(null)({ scanSessionId: id })).rejects.toThrow('No skin analyser is configured.');
    expect(await statusOf(id)).toMatchObject({ status: 'failed', object_key: null, result: null });
    expect(await stored(id)).toBe(false);
  });
});

describe('scan inference lifecycle (with a test model)', () => {
  it('queues once, stores validated observations, and deletes the photo', async () => {
    const id = await uploaded();
    const m = model(async () => valid);
    expect(await requestScanInference(alice, id, m)).toEqual({ ok: true });
    expect(await requestScanInference(alice, id, m)).toEqual({ ok: false, code: 'unavailable' });
    await handler(m)({ scanSessionId: id });
    expect(await statusOf(id)).toMatchObject({ status: 'completed', object_key: null, result: valid });
    expect(await stored(id)).toBe(false);
  });

  it('discards invalid model output instead of storing it', async () => {
    for (const bad of [
      { score: Math.random() },
      { observations: [{ ...valid.observations[0], modelVersion: 'other' }] },
    ]) {
      await client.exec(
        'DELETE FROM scan_attempts; DELETE FROM scan_admissions; DELETE FROM scan_sessions; DELETE FROM consent_records;'
      );
      const id = await uploaded();
      await requestScanInference(
        alice,
        id,
        model(async () => bad)
      );
      await expect(handler(model(async () => bad))({ scanSessionId: id })).rejects.toBeInstanceOf(PermanentJobError);
      expect(await statusOf(id)).toMatchObject({ status: 'failed', result: null, object_key: null });
    }
  });

  it('retries a transient failure once, then gives up within the attempt cap', async () => {
    const id = await uploaded();
    const m = model(async () => {
      throw new Error('provider 503');
    });
    await requestScanInference(alice, id, m);
    await expect(handler(m)({ scanSessionId: id })).rejects.toThrow('provider 503');
    expect((await statusOf(id)).status).toBe('queued');
    await expect(handler(m)({ scanSessionId: id })).rejects.toBeInstanceOf(PermanentJobError);
    expect((await statusOf(id)).status).toBe('failed');
    expect(m.analyze).toHaveBeenCalledTimes(2);
  });

  it('times out a hung model and aborts it', async () => {
    const id = await uploaded();
    let aborted = false;
    const m = model((_img, signal) => new Promise(() => signal.addEventListener('abort', () => (aborted = true))));
    await requestScanInference(alice, id, m);
    const run = skinAnalysisJobHandler({ analyzer: () => m, storage: () => store, timeoutMs: 50 })({
      scanSessionId: id,
    });
    await expect(run).rejects.toThrow('inference timed out');
    expect(aborted).toBe(true);
    expect((await statusOf(id)).status).toBe('queued');
  });

  it('does not run, or keep a result, once consent is withdrawn', async () => {
    const id = await uploaded();
    const m = model(async () => valid);
    await requestScanInference(alice, id, m);
    await withdrawConsent(db as never, alice, 'photo_processing');
    await expect(handler(m)({ scanSessionId: id })).rejects.toBeInstanceOf(PermanentJobError);
    expect(m.analyze).not.toHaveBeenCalled();

    // Withdrawn during inference: the result is discarded and the photo deleted.
    await client.exec(
      'DELETE FROM scan_attempts; DELETE FROM scan_admissions; DELETE FROM scan_sessions; DELETE FROM consent_records;'
    );
    const id2 = await uploaded();
    const late = model(async () => {
      await withdrawConsent(db as never, alice, 'photo_processing');
      return valid;
    });
    await requestScanInference(alice, id2, late);
    await expect(handler(late)({ scanSessionId: id2 })).rejects.toBeInstanceOf(PermanentJobError);
    expect(await statusOf(id2)).toMatchObject({ status: 'revoked', result: null });
    expect(await stored(id2)).toBe(false);
  });

  it('refuses new work when the backlog is full', async () => {
    const id = await uploaded();
    await client.query(
      `INSERT INTO scan_sessions (user_id, consent_id, status, mode, expires_at)
       SELECT 'u-alice', consent_id, 'queued', 'hosted', now() + interval '1 day' FROM scan_sessions, generate_series(1, $1) LIMIT $1`,
      [MAX_PENDING_SCANS]
    );
    expect(
      await requestScanInference(
        alice,
        id,
        model(async () => valid)
      )
    ).toEqual({ ok: false, code: 'backlog_full' });
  });
});
