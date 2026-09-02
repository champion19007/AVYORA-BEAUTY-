import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { otpCodes } from '@/db/schema';

/**
 * Integration tests for one-time codes, against a real Postgres engine.
 *
 * These are security properties, not conveniences, and every one of them is a
 * way the feature gets broken by a plausible refactor:
 *
 *   - a code that survives being used is a replayable credential;
 *   - a code with no attempt cap is six digits an attacker can simply
 *     enumerate;
 *   - a code stored in plaintext turns a database leak into account takeover;
 *   - a superseded code that still works means "resend" hands out a second
 *     live credential rather than replacing the first.
 *
 * PGlite is Postgres compiled to WebAssembly, so the SQL runs for real —
 * including the conditional consume that makes double-use impossible.
 */

const client = new PGlite();
const db = drizzlePglite(client, { schema: { otpCodes } });

// otp.ts imports `db` directly rather than taking it as a parameter, so the
// module is swapped here for the in-memory engine.
vi.mock('@/db', () => ({
  db,
  isDatabaseConfigured: () => true,
}));

const { issueOtp, verifyOtp } = await import('../otp');

const EMAIL = 'shopper@example.com';

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE otp_codes (
      id text PRIMARY KEY,
      identifier text NOT NULL,
      channel text NOT NULL,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('DELETE FROM otp_codes');
});

describe('issueOtp', () => {
  it('returns a six-digit code', async () => {
    const code = await issueOtp(EMAIL, 'email');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('never stores the code in plaintext', async () => {
    const code = await issueOtp(EMAIL, 'email');
    const rows = await db.select().from(otpCodes);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(rows[0]!.codeHash.startsWith('pbkdf2:')).toBe(true);
  });

  it('issuing a new code kills the previous one', async () => {
    const first = await issueOtp(EMAIL, 'email');
    await issueOtp(EMAIL, 'email');

    // The old code must not work, or "resend" would leave two live codes.
    expect(await verifyOtp(EMAIL, first)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('produces different codes across issues', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 8; i++) codes.add(await issueOtp(`u${i}@example.com`, 'email'));
    // A constant or a counter would collapse this set.
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('verifyOtp', () => {
  it('accepts the right code', async () => {
    const code = await issueOtp(EMAIL, 'email');
    expect(await verifyOtp(EMAIL, code)).toEqual({ ok: true });
  });

  it('rejects a code that has already been used', async () => {
    const code = await issueOtp(EMAIL, 'email');
    expect(await verifyOtp(EMAIL, code)).toEqual({ ok: true });

    // Replay must fail: possession of a used code is not proof of anything.
    expect(await verifyOtp(EMAIL, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a code issued for someone else', async () => {
    const code = await issueOtp(EMAIL, 'email');
    expect(await verifyOtp('someone-else@example.com', code)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('burns the code after five wrong guesses', async () => {
    const code = await issueOtp(EMAIL, 'email');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      expect(await verifyOtp(EMAIL, wrong)).toEqual({ ok: false, reason: 'invalid' });
    }

    // The fifth failure exhausts it...
    expect(await verifyOtp(EMAIL, wrong)).toEqual({ ok: false, reason: 'too_many_attempts' });

    // ...and the correct code no longer works, which is the point: an attacker
    // must not get unlimited guesses at a six-digit number.
    expect(await verifyOtp(EMAIL, code)).not.toEqual({ ok: true });
  });

  it('rejects an expired code', async () => {
    const code = await issueOtp(EMAIL, 'email');
    await client.exec(`UPDATE otp_codes SET expires_at = now() - interval '1 minute'`);

    expect(await verifyOtp(EMAIL, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('reports expired rather than invalid when nothing is outstanding', async () => {
    expect(await verifyOtp(EMAIL, '123456')).toEqual({ ok: false, reason: 'expired' });
  });
});
