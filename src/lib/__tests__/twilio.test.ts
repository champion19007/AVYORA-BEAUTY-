import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { smsDeliveryConfigured } from '@/lib/notify';
import { checkSmsCode, sendSmsCode } from '@/lib/sms-code';

// Our own code table must not be touched while Twilio Verify is on.
vi.mock('@/lib/otp', () => ({
  issueOtp: vi.fn(() => {
    throw new Error('issueOtp called');
  }),
  verifyOtp: vi.fn(() => {
    throw new Error('verifyOtp called');
  }),
}));

beforeEach(() => {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
  vi.stubEnv('TWILIO_API_KEY_SID', 'SK123');
  vi.stubEnv('TWILIO_API_KEY_SECRET', 'secret');
  vi.stubEnv('TWILIO_VERIFY_SERVICE_SID', 'VA123');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const twilio = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const form = (init: RequestInit) => new URLSearchParams(init.body as URLSearchParams);

describe('Twilio Verify SMS codes', () => {
  it('starts a verification to the +91 number with the API key', async () => {
    const fetch = twilio(201, { status: 'pending' });
    vi.stubGlobal('fetch', fetch);

    expect(smsDeliveryConfigured()).toBe(true);
    expect(await sendSmsCode('98765 43210')).toEqual({ ok: true });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA123/Verifications');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('SK123:secret').toString('base64')}`);
    expect(Object.fromEntries(form(init))).toEqual({ To: '+919876543210', Channel: 'sms' });
  });

  it('reports a refused send (e.g. unverified number on a trial) as a failure', async () => {
    vi.stubGlobal('fetch', twilio(400, { code: 21608, message: 'unverified' }));
    expect((await sendSmsCode('9876543210')).ok).toBe(false);
  });

  it.each([
    [200, { status: 'approved' }, { ok: true }],
    [200, { status: 'pending' }, { ok: false, reason: 'invalid' }],
    [404, { code: 20404 }, { ok: false, reason: 'expired' }],
    [429, { code: 60202 }, { ok: false, reason: 'too_many_attempts' }],
  ])('maps a check answer %s %j', async (status, body, expected) => {
    vi.stubGlobal('fetch', twilio(status, body));
    expect(await checkSmsCode('9876543210', '123456')).toEqual(expected);
  });
});
