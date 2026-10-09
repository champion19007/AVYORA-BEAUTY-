import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import type { Owner } from '@/lib/guest-owner';
import { grantConsent, withdrawConsent } from '@/modules/personal/personal-records';
import { localPrivateStorage, stagedObjectKey } from '../private-storage';
import { createHostedScan, deleteScan, discardUnprocessedPhoto, getScan, purgeOwnerScans, scanHealth, sweepScans, uploadScanImage } from '../sessions';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const alice: Owner = { kind: 'user', userId: 'u-alice' };
const bob: Owner = { kind: 'user', userId: 'u-bob' };
const store = localPrivateStorage(mkdtempSync(path.join(tmpdir(), 'scan-store-')));
/** Whether any private object for this scan remains (uploads use per-request staged keys). */
const stored = async (id: string) => (await store.list()).some((o) => o.key.startsWith(`private/scans/${id}`));
const db = () => ctx.db as never;
const photo = async () => new Uint8Array(await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 110, b: 100 } } }).jpeg().toBuffer());

beforeAll(async () => {
  ctx = await createMigratedDb();
  await ctx.client.exec(`INSERT INTO users (id, email) VALUES ('u-alice', 'a@example.test'), ('u-bob', 'b@example.test')`);
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec(`DELETE FROM scan_admissions; DELETE FROM scan_sessions; DELETE FROM consent_records;`);
});

const started = async (owner: Owner) => {
  await grantConsent(db(), owner, 'photo_processing', 'p1');
  const out = await createHostedScan(db(), owner, '203.0.113.9');
  if (!out.ok) throw new Error(out.code);
  return out.id;
};

describe('hosted scan sessions', () => {
  it('needs photo consent to start', async () => {
    expect(await createHostedScan(db(), alice, null)).toEqual({ ok: false, code: 'consent_required' });
  });

  it('uploads once, stores privately without metadata, and reports status without the image', async () => {
    const id = await started(alice);
    const up = await uploadScanImage(db(), store, alice, id, await photo());
    expect(up).toEqual({ ok: true, status: 'uploaded', width: 640, height: 480 });
    expect(await stored(id)).toBe(true);
    const scan = await getScan(db(), alice, id);
    expect(scan).toMatchObject({ id, status: 'uploaded', result: null });
    expect(JSON.stringify(scan)).not.toContain('private/');
    expect(await uploadScanImage(db(), store, alice, id, await photo())).toEqual({ ok: false, code: 'wrong_state' });
  });

  it('treats foreign and expired sessions as unavailable', async () => {
    const id = await started(alice);
    expect(await getScan(db(), bob, id)).toBeNull();
    expect(await uploadScanImage(db(), store, bob, id, await photo())).toEqual({ ok: false, code: 'unavailable' });
    expect(await deleteScan(db(), store, bob, id)).toEqual({ found: false, photo: 'none' });
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(await getScan(db(), alice, id, later)).toBeNull();
    expect(await uploadScanImage(db(), store, alice, id, await photo(), later)).toEqual({ ok: false, code: 'unavailable' });
  });

  it('rejects an invalid image and keeps nothing', async () => {
    const id = await started(alice);
    expect(await uploadScanImage(db(), store, alice, id, new TextEncoder().encode('<svg/>'))).toEqual({
      ok: false,
      code: 'invalid_image',
      problem: 'unsupported_type',
    });
    expect(await stored(id)).toBe(false);
  });

  it('refuses uploads with no private storage configured', async () => {
    const id = await started(alice);
    expect(await uploadScanImage(db(), null, alice, id, await photo())).toEqual({ ok: false, code: 'storage_unavailable' });
  });

  it('withdrawing consent stops the session and the purge deletes the photo', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    await withdrawConsent(db(), alice, 'photo_processing');
    expect(await getScan(db(), alice, id)).toBeNull();
    expect(await purgeOwnerScans(db(), store, alice)).toEqual({ deleted: 1, pending: 0 });
    expect(await stored(id)).toBe(false);
    const [row] = (await ctx.client.query<{ status: string; object_key: string | null }>(`SELECT status, object_key FROM scan_sessions WHERE id = $1`, [id])).rows;
    expect(row).toEqual({ status: 'revoked', object_key: null });
  });

  it('owner deletion removes the photo at once', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    expect(await deleteScan(db(), store, alice, id)).toEqual({ found: true, photo: 'deleted' });
    expect(await stored(id)).toBe(false);
    expect(await getScan(db(), alice, id)).toMatchObject({ status: 'revoked' });
  });

  it('the sweep deletes overdue photos, keeps a failed delete for retry, then drops expired scans', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    const day2 = new Date(Date.now() + 25 * 3_600_000);
    expect(await scanHealth(db(), day2)).toMatchObject({ overduePhotos: 1 });

    const broken = { ...store, delete: async () => { throw new Error('storage down'); } };
    expect(await sweepScans(db(), broken, day2)).toMatchObject({ photosDeleted: 0, photoFailures: 1, scansDeleted: 0 });
    expect(await stored(id)).toBe(true);

    expect(await sweepScans(db(), store, day2)).toMatchObject({ photosDeleted: 1, photoFailures: 0, scansDeleted: 0 });
    expect(await stored(id)).toBe(false);
    expect(await scanHealth(db(), day2)).toMatchObject({ overduePhotos: 0 });

    const day8 = new Date(Date.now() + 8 * 86_400_000);
    expect(await sweepScans(db(), store, day8)).toMatchObject({ scansDeleted: 1 });
    // Quotas still count the admission after the scan row is gone.
    expect((await ctx.client.query('SELECT 1 FROM scan_admissions')).rows).toHaveLength(1);
  });

  // Re-audit A13: two uploads to one session; the loser may delete only its own bytes.
  it('concurrent uploads keep the winning photo and leave no untracked object', async () => {
    const id = await started(alice);
    const [a, b] = await Promise.all([uploadScanImage(db(), store, alice, id, await photo()), uploadScanImage(db(), store, alice, id, await photo())]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const [row] = (await ctx.client.query<{ status: string; object_key: string }>('SELECT status, object_key FROM scan_sessions WHERE id = $1', [id])).rows;
    expect(row.status).toBe('uploaded');
    expect(await store.get(row.object_key)).not.toBeNull();
    const mine = (await store.list()).filter((o) => o.key.startsWith(`private/scans/${id}`)).map((o) => o.key);
    expect(mine).toEqual([row.object_key]);
  });

  // Re-audit A07: deletion is "done" only when storage confirms it.
  it('a failed storage delete is reported as pending and keeps the key for a retry', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    const broken = { ...store, delete: async () => { throw new Error('storage down'); } };
    expect(await deleteScan(db(), broken, alice, id)).toEqual({ found: true, photo: 'pending' });
    expect(await stored(id)).toBe(true);
    expect(await getScan(db(), alice, id)).toMatchObject({ status: 'revoked' });
    expect(await deleteScan(db(), store, alice, id)).toEqual({ found: true, photo: 'deleted' });
    expect(await stored(id)).toBe(false);
  });

  it('with no storage configured, deletion is pending, never claimed', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    expect(await deleteScan(db(), null, alice, id)).toEqual({ found: true, photo: 'pending' });
  });

  // Re-audit A06: a photo nothing will process is not kept until a scheduled sweep.
  it('an unprocessed photo is deleted in the same request', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    expect(await discardUnprocessedPhoto(db(), store, id)).toBe(true);
    expect(await stored(id)).toBe(false);
    const [row] = (await ctx.client.query<{ status: string; object_key: string | null }>('SELECT status, object_key FROM scan_sessions WHERE id = $1', [id])).rows;
    expect(row).toEqual({ status: 'failed', object_key: null });
  });

  it('the sweep removes orphaned objects after a grace period, not before', async () => {
    const id = '99999999-9999-4999-8999-999999999999';
    const key = stagedObjectKey(id);
    await store.put(key, new Uint8Array([1, 2, 3]), 'image/jpeg');
    expect((await sweepScans(db(), store, new Date())).orphansDeleted).toBe(0);
    expect(await store.get(key)).not.toBeNull();
    expect((await sweepScans(db(), store, new Date(Date.now() + 20 * 60_000))).orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(await store.get(key)).toBeNull();
  });

  it('lateness is reported for monitoring', async () => {
    const id = await started(alice);
    await uploadScanImage(db(), store, alice, id, await photo());
    const late = new Date(Date.now() + 25 * 3_600_000);
    expect((await scanHealth(db(), late)).maxLatenessMinutes).toBeGreaterThanOrEqual(59);
  });
});
