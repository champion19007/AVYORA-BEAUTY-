import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOrderAccessToken, verifyOrderAccessToken } from '../order-access';

const SECRET = 'x'.repeat(48);
const original = process.env.SESSION_SECRET;

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  process.env.SESSION_SECRET = original;
});

describe('order access tokens', () => {
  it('lets a guest open the order the token was issued for', async () => {
    const token = await createOrderAccessToken('AVY-ABC123');
    expect(token).toBeTruthy();
    expect(await verifyOrderAccessToken('AVY-ABC123', token!)).toBe(true);
  });

  it('refuses a token issued for a different order', async () => {
    // The whole point: a token must not be replayable against another order,
    // or one customer's confirmation link would open everyone else's.
    const token = await createOrderAccessToken('AVY-AAAAAA');
    expect(await verifyOrderAccessToken('AVY-BBBBBB', token!)).toBe(false);
  });

  it('refuses a missing token', async () => {
    expect(await verifyOrderAccessToken('AVY-ABC123', undefined)).toBe(false);
    expect(await verifyOrderAccessToken('AVY-ABC123', '')).toBe(false);
  });

  it('refuses forged and malformed tokens without throwing', async () => {
    for (const bad of ['nonsense', 'a.b', 'a.b.c', '...', 'eyJ.x']) {
      expect(await verifyOrderAccessToken('AVY-ABC123', bad)).toBe(false);
    }
  });

  it('refuses a token whose payload was swapped', async () => {
    const token = await createOrderAccessToken('AVY-AAAAAA');
    const [, signature] = token!.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'order:AVY-BBBBBB', exp: 2 ** 40 })
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verifyOrderAccessToken('AVY-BBBBBB', `${forgedPayload}.${signature}`)).toBe(false);
  });

  it('fails closed when signing is not configured', async () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(await createOrderAccessToken('AVY-ABC123')).toBeNull();
    expect(await verifyOrderAccessToken('AVY-ABC123', 'anything')).toBe(false);
    process.env.SESSION_SECRET = saved;
  });

  it('rejects a session secret too short to be safe', async () => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'short';
    expect(await createOrderAccessToken('AVY-ABC123')).toBeNull();
    process.env.SESSION_SECRET = saved;
  });
});
