import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  getRazorpayConfig,
  isRazorpayConfigured,
  getPublicKeyId,
} from '../razorpay';

const KEY_SECRET = 'test_secret_do_not_use';
const WEBHOOK_SECRET = 'test_webhook_secret';

/** Signs the way Razorpay does, so the tests verify against a real HMAC. */
const sign = (message: string, secret: string) =>
  createHmac('sha256', secret).update(message).digest('hex');

describe('verifyPaymentSignature', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  it('accepts a correctly signed payment', async () => {
    const signature = sign(`${orderId}|${paymentId}`, KEY_SECRET);
    expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(true);
  });

  it('accepts an uppercase signature', async () => {
    const signature = sign(`${orderId}|${paymentId}`, KEY_SECRET).toUpperCase();
    expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', async () => {
    const signature = sign(`${orderId}|${paymentId}`, 'attacker_secret');
    expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(false);
  });

  it('rejects a swapped order id, which is the obvious forgery', async () => {
    // Sign one order, then claim it settles a different one.
    const signature = sign(`order_OTHER|${paymentId}`, KEY_SECRET);
    expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(false);
  });

  it('rejects a swapped payment id', async () => {
    const signature = sign(`${orderId}|pay_OTHER`, KEY_SECRET);
    expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(false);
  });

  it('rejects the separator being moved', async () => {
    // "a|bc" and "ab|c" must not produce the same signature.
    const a = sign('order_ab|c_pay', KEY_SECRET);
    const b = sign('order_a|bc_pay', KEY_SECRET);
    expect(a).not.toEqual(b);
  });

  it('rejects missing or empty fields rather than throwing', async () => {
    for (const bad of [
      { orderId: '', paymentId, signature: 'x' },
      { orderId, paymentId: '', signature: 'x' },
      { orderId, paymentId, signature: '' },
    ]) {
      expect(await verifyPaymentSignature(bad, KEY_SECRET)).toBe(false);
    }
  });

  it('rejects garbage without throwing', async () => {
    for (const signature of ['nonsense', '00', 'z'.repeat(64), '../../etc/passwd']) {
      expect(await verifyPaymentSignature({ orderId, paymentId, signature }, KEY_SECRET)).toBe(
        false
      );
    }
  });
});

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {} } } });

  it('accepts a correctly signed body', async () => {
    expect(await verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(
      true
    );
  });

  it('rejects a tampered body', async () => {
    const signature = sign(body, WEBHOOK_SECRET);
    const tampered = body.replace('captured', 'failed');
    expect(await verifyWebhookSignature(tampered, signature, WEBHOOK_SECRET)).toBe(false);
  });

  it('rejects the wrong secret', async () => {
    expect(await verifyWebhookSignature(body, sign(body, 'other'), WEBHOOK_SECRET)).toBe(false);
  });

  it('is sensitive to whitespace, which is why the raw body must be hashed', async () => {
    // Re-serialising a parsed body changes the bytes and invalidates the signature.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(await verifyWebhookSignature(reserialised, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(
      false
    );
  });

  it('rejects an empty signature', async () => {
    expect(await verifyWebhookSignature(body, '', WEBHOOK_SECRET)).toBe(false);
  });
});

describe('configuration', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = original.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = original.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = original.RAZORPAY_WEBHOOK_SECRET;
  });

  it('reports unconfigured when keys are absent, so checkout can fall back', () => {
    expect(getRazorpayConfig()).toBeNull();
    expect(isRazorpayConfigured()).toBe(false);
    expect(getPublicKeyId()).toBeNull();
  });

  it('requires both halves of the key pair', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    expect(getRazorpayConfig()).toBeNull();
  });

  it('returns config when both are set', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    expect(getRazorpayConfig()).toMatchObject({ keyId: 'rzp_test_abc', keySecret: 'secret' });
    expect(isRazorpayConfigured()).toBe(true);
  });
});
