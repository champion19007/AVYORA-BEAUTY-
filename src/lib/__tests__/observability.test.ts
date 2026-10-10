import { describe, it, expect, vi } from 'vitest';
import { redact, isMonitoringConfigured, logEvent, logWarn, reportError, scrubDeep } from '../observability';

/**
 * Logs are the classic place personal data leaks: retained longer than the
 * data itself, copied into third-party services, and read by more people than
 * the database is. These tests pin the redaction down.
 */
describe('redact', () => {
  it('masks credentials and personal fields', () => {
    const out = redact({
      password: 'hunter2',
      token: 'abc',
      email: 'a@b.com',
      phone: '9999999999',
      fullName: 'Someone Real',
      line1: '12 Example Road',
      postalCode: '560001',
      card: '4111111111111111',
    }) as Record<string, unknown>;

    for (const value of Object.values(out)) expect(value).toBe('[redacted]');
  });

  it('matches on substrings, so key_secret and apiKey are caught', () => {
    const out = redact({ key_secret: 'x', apiKey: 'y', authorization: 'z' }) as Record<string, unknown>;
    expect(Object.values(out).every((v) => v === '[redacted]')).toBe(true);
  });

  it('keeps values that are safe to log', () => {
    const out = redact({ orderNumber: 'AVY-ABC123', total: 77700, ok: true }) as Record<string, unknown>;
    expect(out).toEqual({ orderNumber: 'AVY-ABC123', total: 77700, ok: true });
  });

  it('redacts inside nested objects and arrays', () => {
    const out = redact({
      order: { items: [{ productId: 'x', email: 'a@b.com' }] },
    }) as any;
    expect(out.order.items[0].productId).toBe('x');
    expect(out.order.items[0].email).toBe('[redacted]');
  });

  it('masks personal-care data and scrubs personal data from free text', () => {
    const out = redact({
      answers: { pregnant: 'yes' },
      objectKey: 'private/scans/abc.jpg',
      ownerHash: 'h',
      message: 'insert failed for a@b.com at 9876543210, object private/scans/1111-2222.jpg',
      sku: 'AVY-150ml',
    }) as Record<string, unknown>;
    expect(out.answers).toBe('[redacted]');
    expect(out.objectKey).toBe('[redacted]');
    expect(out.ownerHash).toBe('[redacted]');
    expect(out.message).toBe('insert failed for [email] at [phone], object [private-object]');
    expect(out.sku).toBe('AVY-150ml');
  });

  it('truncates very long strings rather than logging them whole', () => {
    const out = redact({ note: 'x'.repeat(2000) }) as Record<string, string>;
    expect(out.note.length).toBeLessThan(600);
  });

  it('stops recursing on deeply nested input', () => {
    let deep: any = 'bottom';
    for (let i = 0; i < 30; i++) deep = { nested: deep };
    expect(() => redact(deep)).not.toThrow();
  });

  it('handles null and undefined', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});

describe('reportError', () => {
  it('never throws, whatever it is given', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const input of [new Error('boom'), 'a string', null, undefined, circular]) {
      expect(() => reportError(input, { scope: 'test', extra: { circular } })).not.toThrow();
    }
  });
});

describe('isMonitoringConfigured', () => {
  it('is false without a DSN, so nothing is sent by default', () => {
    const saved = { a: process.env.SENTRY_DSN, b: process.env.NEXT_PUBLIC_SENTRY_DSN };
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(isMonitoringConfigured()).toBe(false);
    process.env.SENTRY_DSN = saved.a;
    process.env.NEXT_PUBLIC_SENTRY_DSN = saved.b;
  });
});

// Re-audit A05: the complete envelope is scrubbed, not only `extra`.
describe('complete error envelopes (synthetic personal data)', () => {
  const SECRET = 'synthetic-person@example.test /newsletter?token=SYNTHETIC_SECRET private/scans/1111-2222.jpg 9876543210';

  it('stdout carries no email, token, private object path or phone, in the message or the stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      reportError(new Error(SECRET), { scope: 'test', extra: { answers: { pregnancy: 'yes' } } });
      const line = String(spy.mock.calls[0][0]);
      for (const leak of ['synthetic-person@example.test', 'SYNTHETIC_SECRET', 'private/scans/1111', '9876543210', 'pregnancy']) expect(line).not.toContain(leak);
      expect(JSON.parse(line).error.stack).toContain('[email]');
    } finally {
      spy.mockRestore();
    }
  });

  it('informational messages are scrubbed too', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      logEvent('test', `sent to ${SECRET}`);
      expect(String(spy.mock.calls[0][0])).not.toContain('synthetic-person@example.test');
    } finally {
      spy.mockRestore();
    }
  });

  it('a monitoring payload is scrubbed at full depth, stack frames included', () => {
    const event = {
      exception: { values: [{ value: SECRET, stacktrace: { frames: [{ vars: { email: 'x@y.z', note: SECRET } }] } }] },
      request: { url: `https://shop.test/newsletter?token=SYNTHETIC_SECRET`, cookies: 'session=abc' },
    };
    const out = JSON.stringify(scrubDeep(event));
    for (const leak of ['synthetic-person@example.test', 'SYNTHETIC_SECRET', 'x@y.z', 'session=abc']) expect(out).not.toContain(leak);
  });
});

describe('log levels', () => {
  it('writes info to stdout and warnings to stderr as one JSON line each', () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logEvent('orders', 'placed', { orderNumber: 'AVY-1' });
      logWarn('webhook.razorpay.unknown_order', 'asking for retry', { razorpayOrderId: 'order_1' });

      expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({ level: 'info', scope: 'orders', message: 'placed' });
      expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({
        level: 'warn',
        scope: 'webhook.razorpay.unknown_order',
        extra: { razorpayOrderId: 'order_1' },
      });
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
