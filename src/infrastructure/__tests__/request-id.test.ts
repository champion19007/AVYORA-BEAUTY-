import { describe, expect, it } from 'vitest';
import { newRequestId, normaliseRequestId } from '../request-id';
import { requestIdInScope, runWithRequestId } from '../request-context';

describe('request ids', () => {
  it('mints distinct, recognisable ids', () => {
    const a = newRequestId();
    expect(a).toMatch(/^req_[0-9a-f]{24}$/);
    expect(newRequestId()).not.toBe(a);
  });

  it('keeps a well-formed id from an upstream proxy', () => {
    expect(normaliseRequestId('lb-7f3a9c21-edge')).toBe('lb-7f3a9c21-edge');
  });

  it('replaces anything that could forge a log line or bloat storage', () => {
    for (const hostile of [
      'short',
      'x'.repeat(200),
      'ok-looking\n{"level":"error"}',
      'has spaces in it here',
      '<script>alert(1)</script>',
      null,
      undefined,
    ]) {
      expect(normaliseRequestId(hostile)).toMatch(/^req_/);
    }
  });

  it('carries an explicit id through async work, and nowhere else', async () => {
    expect(requestIdInScope()).toBeNull();

    const seen = await runWithRequestId('req_worker01', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return requestIdInScope();
    });

    expect(seen).toBe('req_worker01');
    expect(requestIdInScope()).toBeNull();
  });
});
