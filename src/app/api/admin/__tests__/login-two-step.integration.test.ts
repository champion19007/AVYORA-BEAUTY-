import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';

/** Owner sign-in needs the emailed code as well as the password; the manager's does not. */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/rate-limit', () => ({
  limit: async () => ({ allowed: true }),
  limitResponse: () => new Response(null, { status: 429 }),
}));
const mail: { to: string; text: string }[] = [];
vi.mock('@/lib/notify', () => ({
  emailDeliveryConfigured: () => true,
  sendEmail: async (to: string, _subject: string, text: string) => {
    mail.push({ to, text });
    return { ok: true };
  },
}));

const { hashPassword } = await import('@/lib/auth');
const { POST } = await import('../login/route');

const login = (body: Record<string, string>) =>
  POST(
    new Request('http://shop.test/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'shop.test', origin: 'http://shop.test' },
      body: JSON.stringify(body),
    })
  );
const cookie = (res: Response) => res.headers.get('set-cookie') ?? '';
const owner = { username: 'owner', password: 'correct horse battery' };

beforeAll(async () => {
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(owner.password);
  process.env.MANAGER_USERNAME = 'manager';
  process.env.MANAGER_PASSWORD_HASH = await hashPassword('stockroom password');
  process.env.OWNER_EMAIL = 'owner@shop.test';
});
beforeEach(async () => {
  mail.length = 0;
  delete process.env.OWNER_TWO_STEP;
  await client.exec('DELETE FROM otp_codes');
});
afterAll(async () => {
  await client?.close();
});

describe('owner two-step sign-in', () => {
  it('emails a code instead of signing in, then signs in with the right code only', async () => {
    const first = await login(owner);
    expect(await first.json()).toEqual({ step: 'code' });
    expect(cookie(first)).toBe('');
    expect(mail[0].to).toBe('owner@shop.test');
    const code = mail[0].text.match(/\d{6}/)![0];

    const wrong = await login({ ...owner, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(401);
    expect(cookie(wrong)).toBe('');

    const right = await login({ ...owner, code });
    expect(right.status).toBe(200);
    expect(cookie(right)).toMatch(/avyora_admin_session=/);

    // A code works once.
    expect((await login({ ...owner, code })).status).toBe(401);
  });

  it('never sends a code for a wrong password', async () => {
    expect((await login({ ...owner, password: 'nope' })).status).toBe(401);
    expect(mail).toHaveLength(0);
  });

  it('leaves the manager on password only, and can be switched off', async () => {
    const manager = await login({ username: 'manager', password: 'stockroom password' });
    expect(cookie(manager)).toMatch(/avyora_admin_session=/);

    process.env.OWNER_TWO_STEP = 'off';
    expect(cookie(await login(owner))).toMatch(/avyora_admin_session=/);
    expect(mail).toHaveLength(0);
  });
});
