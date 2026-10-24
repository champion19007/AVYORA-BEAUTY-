import { describe, expect, it } from 'vitest';
import { sameSitePath } from '@/lib/safe-redirect';

describe('sameSitePath', () => {
  it('keeps paths on this site', () => {
    expect(sameSitePath('/account/orders?tab=2#x')).toBe('/account/orders?tab=2#x');
    expect(sameSitePath('/checkout')).toBe('/checkout');
  });

  it('refuses anything the browser would send to another site', () => {
    for (const evil of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      'javascript:alert(1)',
    ]) {
      expect(sameSitePath(evil)).toBe('/account');
    }
  });

  it('falls back when nothing was asked for', () => {
    expect(sameSitePath(null)).toBe('/account');
    expect(sameSitePath('')).toBe('/account');
  });
});
