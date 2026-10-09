import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normaliseStatus, toPaise, verifyCashfreeWebhook } from '@/lib/cashfree';

const secret = 'test_secret_not_real';
const sign = (ts: string, body: string) => createHmac('sha256', secret).update(ts + body).digest('base64');

describe('Cashfree webhook signature', () => {
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"AVY-1"}}}';
  const ts = '1760000000';

  it('accepts the signature Cashfree computes over timestamp + raw body', async () => {
    expect(await verifyCashfreeWebhook(body, ts, sign(ts, body), secret)).toBe(true);
  });

  it('rejects a changed body, a changed timestamp, a wrong key and missing headers', async () => {
    const sig = sign(ts, body);
    expect(await verifyCashfreeWebhook(body.replace('AVY-1', 'AVY-2'), ts, sig, secret)).toBe(false);
    expect(await verifyCashfreeWebhook(body, '1760000001', sig, secret)).toBe(false);
    expect(await verifyCashfreeWebhook(body, ts, sig, 'other')).toBe(false);
    expect(await verifyCashfreeWebhook(body, '', sig, secret)).toBe(false);
    expect(await verifyCashfreeWebhook(body, ts, '', secret)).toBe(false);
  });
});

describe('Cashfree amounts and statuses', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(1299.99)).toBe(129999);
    expect(toPaise(0.29)).toBe(29);
  });

  it('maps only SUCCESS to success; unknown values are not a payment', () => {
    expect(normaliseStatus('SUCCESS')).toBe('success');
    expect(normaliseStatus('FAILED')).toBe('failed');
    expect(normaliseStatus('USER_DROPPED')).toBe('dropped');
    expect(normaliseStatus('PENDING')).toBe('pending');
    expect(normaliseStatus('SOMETHING_NEW')).toBe('other');
    expect(normaliseStatus(undefined)).toBe('other');
  });
});
