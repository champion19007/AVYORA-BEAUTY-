import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth';
import { guestPhoneCheckRequired, normalisePhone, phoneProofValid, signPhoneProof } from '@/lib/checkout-phone';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-0123456789');
  vi.stubEnv('FAST2SMS_API_KEY', 'test-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('checkout phone proof', () => {
  it('normalises the ways a number is typed', () => {
    for (const typed of ['9876543210', '+91 98765 43210', '+91-9876543210', '09876543210', ' 98765-43210 '])
      expect(normalisePhone(typed)).toBe('9876543210');
  });

  it('accepts the proof for the same number however it is typed', async () => {
    const proof = await signPhoneProof('9876543210');
    expect(await phoneProofValid(proof, '+91 98765 43210')).toBe(true);
  });

  it('rejects a proof for a different number, a missing one, or a tampered one', async () => {
    const proof = await signPhoneProof('9876543210');
    expect(await phoneProofValid(proof, '9123456789')).toBe(false);
    expect(await phoneProofValid(undefined, '9876543210')).toBe(false);
    expect(await phoneProofValid(`${proof}x`, '9876543210')).toBe(false);
  });

  it('does not accept another token signed with the session secret', async () => {
    // e.g. a staff session token: same secret, different key derivation.
    const other = await createSessionToken('9876543210', process.env.SESSION_SECRET!);
    expect(await phoneProofValid(other, '9876543210')).toBe(false);
  });

  it('is asked of guests only, and only where SMS can be sent', () => {
    expect(guestPhoneCheckRequired(null)).toBe(true);
    expect(guestPhoneCheckRequired('user_1')).toBe(false);
    vi.stubEnv('FAST2SMS_API_KEY', '');
    expect(guestPhoneCheckRequired(null)).toBe(false);
  });
});
