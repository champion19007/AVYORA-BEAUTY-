import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { hashGuestSecret, newGuestSecret, type Owner } from '@/lib/guest-owner';
import {
  activeConsent,
  grantConsent,
  savedRoutines,
  saveRoutine,
  withdrawConsent,
} from '../personal-records';

/*
 * The database is the enforcement point for ownership, consent and expiry,
 * so these tests mostly write SQL directly and expect refusals. The legacy
 * row is written before migration 0016, exactly as production had it.
 */

const MIGRATION = '0016_personal_records';
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let preDir: string;

const q = (text: string, params: unknown[] = []) => client.query(text, params);
const rows = async (text: string, params: unknown[] = []) => (await q(text, params)).rows;

const guestA = hashGuestSecret(newGuestSecret())!;
const guestB = hashGuestSecret(newGuestSecret())!;
const alice: Owner = { kind: 'user', userId: 'u-alice' };
const bob: Owner = { kind: 'user', userId: 'u-bob' };
const guest: Owner = { kind: 'guest', ownerHash: guestA };
const otherGuest: Owner = { kind: 'guest', ownerHash: guestB };

const SAVE = { answers: { skinType: 'dry', pregnancy: 'unknown' }, result: { mode: 'essentials' }, engineVersion: 'test', kbRelease: null };

beforeAll(async () => {
  preDir = mkdtempSync(join(tmpdir(), 'pre0016-'));
  cpSync('drizzle', preDir, { recursive: true });
  const journalPath = join(preDir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === MIGRATION);
  for (const e of journal.entries.slice(cut)) rmSync(join(preDir, `${e.tag}.sql`));
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));

  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: preDir });

  await q(`INSERT INTO users (id, email) VALUES ('u-alice', 'alice@example.test'), ('u-bob', 'bob@example.test')`);
  // As saved automatically before 0016: answers, keyed by the cart cookie.
  await q(`INSERT INTO routine_results (id, anonymous_id, answers, result) VALUES
    ('legacy-guest', 'cart-cookie-value', '{"pregnancy":"no"}', '{"mode":"treatment"}'),
    ('legacy-user', NULL, '{"pregnancy":"yes"}', '{"mode":"essentials"}')`);
  await q(`UPDATE routine_results SET user_id = 'u-alice' WHERE id = 'legacy-user'`);

  await migrate(db, { migrationsFolder: 'drizzle' });
}, 60_000);

afterAll(async () => {
  await client?.close();
  rmSync(preDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await client.exec(`DELETE FROM routine_feedback; DELETE FROM scan_sessions; DELETE FROM routine_results WHERE schema_version > 0;
           DELETE FROM skin_profiles; DELETE FROM consent_records;`);
});

const grant = async (owner: Owner, purpose: schema.ConsentPurpose) =>
  (await grantConsent(db as never, owner, purpose, 'policy-test-1')).id;

describe('migrating existing routines', () => {
  it('keeps every legacy row, its id and its content, marked as legacy', async () => {
    expect(await rows(`SELECT id, user_id, anonymous_id, schema_version, answers FROM routine_results WHERE schema_version = 0 ORDER BY id`)).toEqual([
      { id: 'legacy-guest', user_id: null, anonymous_id: 'cart-cookie-value', schema_version: 0, answers: { pregnancy: 'no' } },
      { id: 'legacy-user', user_id: 'u-alice', anonymous_id: null, schema_version: 0, answers: { pregnancy: 'yes' } },
    ]);
  });

  it('never returns a legacy row as a saved routine, to the account or to any guest', async () => {
    expect(await savedRoutines(db as never, alice)).toEqual([]);
    expect(await savedRoutines(db as never, guest)).toEqual([]);
  });

  it('refuses the old automatic save (no version, no consent)', async () => {
    await expect(q(`INSERT INTO routine_results (id, anonymous_id, answers, result) VALUES ('x', 'cart', '{}', '{}')`)).rejects.toThrow(/schema_version/);
    await expect(
      q(`INSERT INTO routine_results (id, anonymous_id, answers, result, schema_version) VALUES ('x', 'cart', '{}', '{}', 1)`)
    ).rejects.toThrow(/routine_results_versioned_owner/);
  });

  it('a legacy row cannot be given a guest owner or consent after the fact', async () => {
    await expect(q(`UPDATE routine_results SET anonymous_owner_hash = $1 WHERE id = 'legacy-guest'`, [guestA])).rejects.toThrow(/legacy_shape/);
  });
});

describe('exactly one owner', () => {
  it.each([
    ['consent_records', `INSERT INTO consent_records (user_id, anonymous_owner_hash, purpose, policy_version) VALUES ('u-alice', '${guestA}', 'routine_saving', 'p')`],
    ['consent_records', `INSERT INTO consent_records (purpose, policy_version) VALUES ('routine_saving', 'p')`],
    ['consent_records', `INSERT INTO consent_records (anonymous_owner_hash, purpose, policy_version) VALUES ('client-chosen-id', 'routine_saving', 'p')`],
  ])('%s refuses two owners, no owner, or a value that is not a secret hash', async (_, sql) => {
    await expect(q(sql)).rejects.toThrow(/one_owner|hash_shape/);
  });

  it('skin profiles and scans refuse two owners or none', async () => {
    // The consent trigger would refuse these first (owner mismatch); switch
    // it off here so the CHECK constraints are proven on their own.
    await client.exec(`ALTER TABLE skin_profiles DISABLE TRIGGER skin_profiles_require_consent;
                       ALTER TABLE scan_sessions DISABLE TRIGGER scan_sessions_require_consent;`);
    const consent = await grant(alice, 'routine_saving');
    await expect(
      q(`INSERT INTO skin_profiles (user_id, anonymous_owner_hash, consent_id, schema_version, answers, expires_at)
         VALUES ('u-alice', $1, $2, 1, '{}', now() + interval '1 day')`, [guestA, consent])
    ).rejects.toThrow(/skin_profiles_one_owner/);
    const photo = await grant(alice, 'photo_processing');
    await expect(
      q(`INSERT INTO scan_sessions (consent_id, mode, expires_at) VALUES ($1, 'local', now() + interval '1 day')`, [photo])
    ).rejects.toThrow(/scan_sessions_one_owner/);
    await client.exec(`ALTER TABLE skin_profiles ENABLE TRIGGER skin_profiles_require_consent;
                       ALTER TABLE scan_sessions ENABLE TRIGGER scan_sessions_require_consent;`);
  });

  it('a record cannot borrow another owner’s consent', async () => {
    const aliceConsent = await grant(alice, 'routine_saving');
    await expect(
      q(`INSERT INTO skin_profiles (user_id, consent_id, schema_version, answers, expires_at)
         VALUES ('u-bob', $1, 1, '{}', now() + interval '1 day')`, [aliceConsent])
    ).rejects.toThrow(/different owner/);
  });

  it('owners only ever see their own saved routines', async () => {
    for (const o of [alice, bob, guest, otherGuest]) await grant(o, 'routine_saving');
    await saveRoutine(db as never, alice, SAVE);
    await saveRoutine(db as never, guest, SAVE);
    expect(await savedRoutines(db as never, alice)).toHaveLength(1);
    expect(await savedRoutines(db as never, guest)).toHaveLength(1);
    expect(await savedRoutines(db as never, bob)).toEqual([]);
    expect(await savedRoutines(db as never, otherGuest)).toEqual([]);
  });
});

describe('consent purposes', () => {
  it('nothing is saved without routine-saving consent', async () => {
    expect(await saveRoutine(db as never, guest, SAVE)).toEqual({ saved: false, reason: 'no_consent' });
    await grant(guest, 'photo_processing');
    expect(await saveRoutine(db as never, guest, SAVE)).toEqual({ saved: false, reason: 'no_consent' });
    expect(await rows(`SELECT count(*)::int n FROM skin_profiles`)).toEqual([{ n: 0 }]);
  });

  it('a consent for one purpose cannot stand in for another', async () => {
    const photo = await grant(alice, 'photo_processing');
    await expect(
      q(`INSERT INTO skin_profiles (user_id, consent_id, schema_version, answers, expires_at)
         VALUES ('u-alice', $1, 1, '{}', now() + interval '1 day')`, [photo])
    ).rejects.toThrow(/skin_profiles_consent_fk/);
    const saving = await grant(alice, 'routine_saving');
    await expect(
      q(`INSERT INTO scan_sessions (user_id, consent_id, mode, expires_at) VALUES ('u-alice', $1, 'local', now() + interval '1 day')`, [saving])
    ).rejects.toThrow(/scan_sessions_consent_fk/);
  });

  it('keeps the four purposes separate, one active grant each', async () => {
    for (const p of schema.CONSENT_PURPOSES) await grant(alice, p);
    expect(await rows(`SELECT count(*)::int n FROM consent_records WHERE user_id = 'u-alice'`)).toEqual([{ n: 4 }]);
    await expect(
      q(`INSERT INTO consent_records (user_id, purpose, policy_version) VALUES ('u-alice', 'model_research', 'p2')`)
    ).rejects.toThrow(/one_active_user/);
    await expect(q(`INSERT INTO consent_records (user_id, purpose, policy_version) VALUES ('u-alice', 'marketing', 'p')`)).rejects.toThrow(/consent_records_purpose/);
  });
});

describe('consent withdrawal', () => {
  it('stops new saving at once, and hides what was saved under it', async () => {
    await grant(guest, 'routine_saving');
    expect(await saveRoutine(db as never, guest, SAVE)).toMatchObject({ saved: true });
    const consentId = (await activeConsent(db as never, guest, 'routine_saving'))!.id;

    expect(await withdrawConsent(db as never, guest, 'routine_saving')).toBe(true);
    expect(await saveRoutine(db as never, guest, SAVE)).toEqual({ saved: false, reason: 'no_consent' });
    expect(await savedRoutines(db as never, guest)).toEqual([]);
    await expect(
      q(`INSERT INTO skin_profiles (anonymous_owner_hash, consent_id, schema_version, answers, expires_at)
         VALUES ($1, $2, 1, '{}', now() + interval '1 day')`, [guestA, consentId])
    ).rejects.toThrow(/has been withdrawn/);
  });

  it('revokes scans and their results, and refuses to advance them', async () => {
    const photo = await grant(alice, 'photo_processing');
    await q(`INSERT INTO scan_sessions (id, user_id, consent_id, mode, status, result, expires_at)
             VALUES ('00000000-0000-0000-0000-000000000001', 'u-alice', $1, 'hosted', 'queued', '{"x":1}', now() + interval '1 day'),
                    ('00000000-0000-0000-0000-000000000002', 'u-alice', $1, 'local', 'completed', '{"x":2}', now() + interval '1 day')`, [photo]);
    await withdrawConsent(db as never, alice, 'photo_processing');
    expect(await rows(`SELECT status, result FROM scan_sessions ORDER BY id`)).toEqual([
      { status: 'revoked', result: null },
      { status: 'revoked', result: null },
    ]);
    await expect(q(`UPDATE scan_sessions SET status = 'processing'`)).rejects.toThrow(/has been withdrawn/);
  });

  it('is permanent: a withdrawn consent cannot be restored or edited; a new grant is a new record', async () => {
    const id = await grant(bob, 'model_research');
    await withdrawConsent(db as never, bob, 'model_research');
    await expect(q(`UPDATE consent_records SET withdrawn_at = NULL WHERE id = $1`, [id])).rejects.toThrow(/only be withdrawn, once/);
    await expect(q(`UPDATE consent_records SET purpose = 'routine_saving' WHERE id = $1`, [id])).rejects.toThrow(/only be withdrawn, once/);
    const again = await grant(bob, 'model_research');
    expect(again).not.toBe(id);
  });
});

describe('expiry', () => {
  it('guest records expire within 30 days; account records must expire', async () => {
    const c = await grant(guest, 'routine_saving');
    await expect(
      q(`INSERT INTO skin_profiles (anonymous_owner_hash, consent_id, schema_version, answers, expires_at)
         VALUES ($1, $2, 1, '{}', now() + interval '31 days')`, [guestA, c])
    ).rejects.toThrow(/guest_expiry/);
    await grant(alice, 'routine_saving');
    const saved = await saveRoutine(db as never, alice, SAVE);
    expect(saved.saved).toBe(true);
    expect(await rows(`SELECT (expires_at - created_at) = interval '180 days' AS ok FROM routine_results WHERE user_id = 'u-alice' AND schema_version = 1`)).toEqual([{ ok: true }]);
  });

  it('a guest save gets 30 days, and expired routines are no longer returned', async () => {
    await grant(guest, 'routine_saving');
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    await saveRoutine(db as never, guest, { ...SAVE, now: longAgo });
    expect(await savedRoutines(db as never, guest)).toEqual([]);
  });

  it.each([
    ['observations kept beyond 7 days', `'local', NULL, NULL, now() + interval '8 days'`, /scan_sessions_expiry/],
    ['a public URL as the photo key', `'hosted', 'https://cdn.example.test/scan.jpg', now() + interval '1 hour', now() + interval '1 day'`, /private_object/],
    ['a key outside the private prefix', `'hosted', 'public/scans/a.jpg', now() + interval '1 hour', now() + interval '1 day'`, /private_object/],
    ['a key escaping the prefix', `'hosted', 'private/scans/../media/a.jpg', now() + interval '1 hour', now() + interval '1 day'`, /private_object/],
    ['a photo kept beyond 24 hours', `'hosted', 'private/scans/a.jpg', now() + interval '25 hours', now() + interval '2 days'`, /private_object/],
    ['a photo with no deletion time', `'hosted', 'private/scans/a.jpg', NULL, now() + interval '1 day'`, /private_object/],
    ['a stored photo for a local scan', `'local', 'private/scans/a.jpg', now() + interval '1 hour', now() + interval '1 day'`, /private_object/],
  ])('scans refuse %s', async (_, values, error) => {
    const photo = await grant(alice, 'photo_processing');
    await expect(
      q(`INSERT INTO scan_sessions (user_id, consent_id, mode, object_key, object_expires_at, expires_at) VALUES ('u-alice', $1, ${values})`, [photo])
    ).rejects.toThrow(error);
  });

  it('accepts a private, short-lived hosted photo', async () => {
    const photo = await grant(alice, 'photo_processing');
    await q(`INSERT INTO scan_sessions (user_id, consent_id, mode, object_key, object_expires_at, expires_at)
             VALUES ('u-alice', $1, 'hosted', 'private/scans/abc.jpg', now() + interval '1 hour', now() + interval '7 days')`, [photo]);
  });
});

describe('weekly feedback', () => {
  const routineFor = async (owner: Owner) => {
    await grant(owner, 'routine_saving');
    const r = await saveRoutine(db as never, owner, SAVE);
    if (!r.saved) throw new Error('save failed');
    return r.routineId;
  };
  const feedback = (routineId: string, week: number, over = '') =>
    q(`INSERT INTO routine_feedback (routine_id, user_id, week, adherence, tolerability, reported_change)
       VALUES ($1, 'u-alice', $2, ${over || `'most_days', 'comfortable', 'same'`})`, [routineId, week]);

  it('one report per routine per week', async () => {
    const routine = await routineFor(alice);
    await feedback(routine, 1);
    await expect(feedback(routine, 1)).rejects.toThrow(/once_per_week/);
    await feedback(routine, 2);
  });

  it('bounded weeks and answers', async () => {
    const routine = await routineFor(alice);
    await expect(feedback(routine, 0)).rejects.toThrow(/routine_feedback_week/);
    await expect(feedback(routine, 53)).rejects.toThrow(/routine_feedback_week/);
    await expect(feedback(routine, 3, `'always', 'comfortable', 'same'`)).rejects.toThrow(/adherence/);
    await expect(feedback(routine, 3, `'most_days', 'cured', 'same'`)).rejects.toThrow(/tolerability/);
  });

  it('must point at a real routine and a real account', async () => {
    await expect(feedback('no-such-routine', 1)).rejects.toThrow(/foreign key/);
    const routine = await routineFor(alice);
    await expect(
      q(`INSERT INTO routine_feedback (routine_id, user_id, week, adherence, tolerability, reported_change)
         VALUES ($1, 'u-nobody', 1, 'most_days', 'comfortable', 'same')`, [routine])
    ).rejects.toThrow(/foreign key/);
  });

  it('deleting an account removes its consents, profiles, routines and feedback; history stays for others', async () => {
    await q(`INSERT INTO users (id, email) VALUES ('u-carol', 'carol@example.test')`);
    const carol: Owner = { kind: 'user', userId: 'u-carol' };
    const routine = await routineFor(carol);
    await q(`INSERT INTO routine_feedback (routine_id, user_id, week, adherence, tolerability, reported_change)
             VALUES ($1, 'u-carol', 1, 'most_days', 'comfortable', 'same')`, [routine]);
    await q(`DELETE FROM users WHERE id = 'u-carol'`);
    for (const table of ['consent_records', 'skin_profiles', 'routine_results', 'routine_feedback']) {
      expect(await rows(`SELECT count(*)::int n FROM ${table} WHERE user_id = 'u-carol'`)).toEqual([{ n: 0 }]);
    }
    expect(await rows(`SELECT count(*)::int n FROM routine_results WHERE schema_version = 0`)).toEqual([{ n: 2 }]);
  });
});

describe('guest secrets', () => {
  it('are 256-bit, server-generated, and stored only as a hash', () => {
    const secret = newGuestSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newGuestSecret()).not.toBe(secret);
    expect(hashGuestSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestSecret(secret)).not.toContain(secret);
  });

  it('refuse anything that is not a secret we issued, such as a cart id or a supplied hash', () => {
    expect(hashGuestSecret(crypto.randomUUID())).toBeNull();
    expect(hashGuestSecret(guestA)).toBeNull();
    expect(hashGuestSecret('')).toBeNull();
    expect(hashGuestSecret(undefined)).toBeNull();
  });
});
