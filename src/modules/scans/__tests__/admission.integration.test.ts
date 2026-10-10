import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import { hashGuestSecret, newGuestSecret, type Owner } from '@/lib/guest-owner';
import { grantConsent, withdrawConsent } from '@/modules/personal/personal-records';
import { admitHostedScan, recordBillableAttempt, SCAN_QUOTAS } from '../admission';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const alice: Owner = { kind: 'user', userId: 'u-alice' };
const bob: Owner = { kind: 'user', userId: 'u-bob' };
const guest: Owner = { kind: 'guest', ownerHash: hashGuestSecret(newGuestSecret())! };

beforeAll(async () => {
  ctx = await createMigratedDb();
  await ctx.client.exec(
    `INSERT INTO users (id, email) VALUES ('u-alice', 'a@example.test'), ('u-bob', 'b@example.test')`
  );
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec(`DELETE FROM scan_admissions; DELETE FROM scan_sessions; DELETE FROM consent_records;`);
});

const consent = async (owner: Owner) => (await grantConsent(ctx.db as never, owner, 'photo_processing', 'p1')).id;
const admit = async (owner: Owner, ip: string | null, now?: Date, quotas = SCAN_QUOTAS) =>
  admitHostedScan(ctx.db as never, { owner, ipAddress: ip, consentId: await consent(owner), now, quotas });

describe('hosted scan admission', () => {
  it('admits 3 per owner per UTC day, and the next day again', async () => {
    const day = new Date('2026-10-08T10:00:00Z');
    for (let i = 0; i < 3; i++) expect(await admit(alice, '203.0.113.1', day)).toMatchObject({ admitted: true });
    expect(await admit(alice, '203.0.113.1', day)).toEqual({ admitted: false, reason: 'owner_daily' });
    expect(await admit(alice, '203.0.113.1', new Date('2026-10-09T00:00:01Z'))).toMatchObject({ admitted: true });
  });

  it('enforces 10 per rolling 30 days, even after the scans themselves are deleted', async () => {
    for (let d = 0; d < 10; d++) {
      expect(await admit(alice, null, new Date(Date.UTC(2026, 9, 1 + d, 12)))).toMatchObject({ admitted: true });
    }
    // The expiry sweeper deletes scans after 7 days; admissions must still count.
    await ctx.client.exec('DELETE FROM scan_sessions');
    expect(await admit(alice, null, new Date(Date.UTC(2026, 9, 12, 12)))).toEqual({
      admitted: false,
      reason: 'owner_30_days',
    });
    expect(await admit(alice, null, new Date(Date.UTC(2026, 9, 31, 13)))).toMatchObject({ admitted: true });
  });

  it('applies the soft per-IP ceiling across owners, and the global daily cap', async () => {
    const day = new Date('2026-10-08T10:00:00Z');
    const small = { ...SCAN_QUOTAS, perIpDay: 2, globalDay: 3 };
    expect(await admit(alice, '198.51.100.5', day, small)).toMatchObject({ admitted: true });
    expect(await admit(bob, '198.51.100.5', day, small)).toMatchObject({ admitted: true });
    expect(await admit(guest, '198.51.100.5', day, small)).toEqual({ admitted: false, reason: 'ip_daily' });
    expect(await admit(guest, '198.51.100.6', day, small)).toMatchObject({ admitted: true });
    expect(await admit(guest, '198.51.100.7', day, small)).toEqual({ admitted: false, reason: 'global_daily' });
  });

  it('admits exactly the quota when requests race', async () => {
    const id = await consent(alice);
    const day = new Date('2026-10-08T10:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admitHostedScan(ctx.db as never, { owner: alice, ipAddress: null, consentId: id, now: day })
      )
    );
    expect(results.filter((r) => r.admitted)).toHaveLength(3);
  });

  it('refuses without an active photo consent', async () => {
    const id = await consent(alice);
    await withdrawConsent(ctx.db as never, alice, 'photo_processing');
    expect(await admitHostedScan(ctx.db as never, { owner: alice, ipAddress: null, consentId: id })).toEqual({
      admitted: false,
      reason: 'no_consent',
    });
  });

  it('fails closed when the database is unavailable', async () => {
    const broken = {
      transaction: async () => {
        throw new Error('connection refused');
      },
    };
    expect(await admitHostedScan(broken as never, { owner: alice, ipAddress: null, consentId: 'x' })).toEqual({
      admitted: false,
      reason: 'unavailable',
    });
  });
});

describe('billable attempts', () => {
  it('allows two attempts per scan and never a third, even concurrently', async () => {
    const r = await admit(bob, null);
    if (!r.admitted) throw new Error('not admitted');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordBillableAttempt(ctx.db as never, r.scanSessionId))
    );
    expect(results.filter((x) => x.ok)).toHaveLength(2);
    expect(await recordBillableAttempt(ctx.db as never, r.scanSessionId)).toEqual({ ok: false });
    await expect(
      ctx.client.query(`INSERT INTO scan_attempts (scan_session_id, attempt) VALUES ($1, 3)`, [r.scanSessionId])
    ).rejects.toThrow(/scan_attempts_budget/);
  });
});
