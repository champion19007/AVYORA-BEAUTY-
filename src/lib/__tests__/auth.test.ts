import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getAdminConfig,
} from '../auth';

const SECRET = 'a'.repeat(48);

describe('password hashing', () => {
  it('accepts the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toEqual(await hashPassword('same'));
  });

  it('never stores the password in the hash', async () => {
    const stored = await hashPassword('sup3rsecret-passphrase');
    expect(stored).not.toContain('sup3rsecret');
  });

  it('rejects malformed stored hashes rather than throwing', async () => {
    for (const bad of ['', 'nonsense', 'pbkdf2:abc:x:y', 'md5:1:a:b', 'pbkdf2:10:a:b']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });
});

describe('session tokens', () => {
  it('round-trips a valid token', async () => {
    const token = await createSessionToken('admin', SECRET);
    expect((await verifySessionToken(token, SECRET))?.sub).toBe('admin');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken('admin', SECRET);
    expect(await verifySessionToken(token, 'b'.repeat(48))).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await createSessionToken('admin', SECRET);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'attacker', exp: 2 ** 40 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifySessionToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verifySessionToken(`${body}.${forged}`, SECRET)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const token = await createSessionToken('admin', SECRET);
    const [body] = token.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // An unsigned token claiming a far-future expiry must still be refused.
    expect(await verifySessionToken('e30.e30', SECRET)).toBeNull();
  });

  it('rejects missing and malformed tokens', async () => {
    for (const bad of [undefined, '', 'no-dot', 'a.b.c', '...']) {
      expect(await verifySessionToken(bad as string | undefined, SECRET)).toBeNull();
    }
  });
});

describe('getAdminConfig', () => {
  const original = { ...process.env };
  const reset = () => {
    process.env.ADMIN_USERNAME = original.ADMIN_USERNAME;
    process.env.ADMIN_PASSWORD_HASH = original.ADMIN_PASSWORD_HASH;
    process.env.SESSION_SECRET = original.SESSION_SECRET;
  };

  it('fails closed when unconfigured', () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.SESSION_SECRET;
    expect(getAdminConfig()).toBeNull();
    reset();
  });

  it('rejects a session secret that is too short to be safe', () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD_HASH = 'pbkdf2:210000:aaaa:bbbb';
    process.env.SESSION_SECRET = 'short';
    expect(getAdminConfig()).toBeNull();
    reset();
  });

  it('returns config when fully set', () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD_HASH = 'pbkdf2:210000:aaaa:bbbb';
    process.env.SESSION_SECRET = SECRET;
    expect(getAdminConfig()).toEqual({
      username: 'admin',
      passwordHash: 'pbkdf2:210000:aaaa:bbbb',
      sessionSecret: SECRET,
    });
    reset();
  });
});
