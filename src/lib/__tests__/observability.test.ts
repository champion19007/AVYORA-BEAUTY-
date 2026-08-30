import { describe, it, expect } from 'vitest';
import { redact, isMonitoringConfigured, reportError } from '../observability';

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
