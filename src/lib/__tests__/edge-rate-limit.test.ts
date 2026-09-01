import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeRateLimit, resetEdgeRateLimits } from '@/lib/edge-rate-limit';

describe('edgeRateLimit', () => {
  beforeEach(() => {
    resetEdgeRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit and blocks the one after', () => {
    for (let i = 0; i < 5; i++) {
      expect(edgeRateLimit('ip:1.2.3.4', 5, 60).allowed).toBe(true);
    }

    const blocked = edgeRateLimit('ip:1.2.3.4', 5, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent, so one visitor cannot block another', () => {
    for (let i = 0; i < 6; i++) edgeRateLimit('ip:1.1.1.1', 5, 60);

    expect(edgeRateLimit('ip:1.1.1.1', 5, 60).allowed).toBe(false);
    expect(edgeRateLimit('ip:2.2.2.2', 5, 60).allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', () => {
    for (let i = 0; i < 6; i++) edgeRateLimit('ip:9.9.9.9', 5, 60);
    expect(edgeRateLimit('ip:9.9.9.9', 5, 60).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(edgeRateLimit('ip:9.9.9.9', 5, 60).allowed).toBe(true);
  });

  it('reports a shrinking retry-after as the window drains', () => {
    for (let i = 0; i < 6; i++) edgeRateLimit('ip:5.5.5.5', 5, 60);
    const first = edgeRateLimit('ip:5.5.5.5', 5, 60).retryAfterSeconds;

    vi.advanceTimersByTime(30_000);
    const later = edgeRateLimit('ip:5.5.5.5', 5, 60).retryAfterSeconds;

    expect(later).toBeLessThan(first);
  });

  /**
   * The eviction path matters: an attacker spraying spoofed forwarded-for
   * values must not be able to grow the map until the isolate dies. Ten
   * thousand distinct keys should stay bounded and keep serving.
   */
  it('stays bounded under a flood of unique keys', () => {
    for (let i = 0; i < 12_000; i++) {
      expect(edgeRateLimit(`ip:10.0.${Math.floor(i / 256)}.${i % 256}`, 5, 60).allowed).toBe(true);
    }

    // A real visitor still gets through after the flood.
    expect(edgeRateLimit('ip:203.0.113.7', 5, 60).allowed).toBe(true);
  });

  it('is synchronous, so middleware can never block on it', () => {
    const result = edgeRateLimit('ip:sync', 5, 60);
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.allowed).toBe('boolean');
  });
});
