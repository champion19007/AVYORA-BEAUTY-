import { afterEach, describe, expect, it } from 'vitest';
import { demoModeEnabled, isDemoIdentifier } from '@/lib/demo-access';

/**
 * The demo allowlist is the only thing standing between "a login code is shown
 * on screen" and "anyone can sign in as anyone". These tests pin the two
 * properties that make it safe: it is off unless deliberately configured, and
 * it never matches an identifier that was not listed.
 */

const ORIGINAL = process.env.DEMO_IDENTIFIERS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DEMO_IDENTIFIERS;
  else process.env.DEMO_IDENTIFIERS = ORIGINAL;
});

describe('demo access', () => {
  it('is off when the variable is unset', () => {
    delete process.env.DEMO_IDENTIFIERS;

    expect(demoModeEnabled()).toBe(false);
    // Nothing matches, so nothing is ever revealed.
    expect(isDemoIdentifier('anyone@example.com')).toBe(false);
    expect(isDemoIdentifier('9876543210')).toBe(false);
  });

  it('is off when the variable is empty or only separators', () => {
    for (const value of ['', '   ', ',', ' , , ']) {
      process.env.DEMO_IDENTIFIERS = value;
      expect(demoModeEnabled()).toBe(false);
      expect(isDemoIdentifier('anyone@example.com')).toBe(false);
    }
  });

  it('matches only the listed identifiers', () => {
    process.env.DEMO_IDENTIFIERS = 'owner@example.com, 9876543210';

    expect(isDemoIdentifier('owner@example.com')).toBe(true);
    expect(isDemoIdentifier('9876543210')).toBe(true);

    // An attacker's own address must not be revealed a code.
    expect(isDemoIdentifier('attacker@example.com')).toBe(false);
    expect(isDemoIdentifier('9999999999')).toBe(false);
  });

  it('is case-insensitive for email, as addresses are', () => {
    process.env.DEMO_IDENTIFIERS = 'Owner@Example.COM';
    expect(isDemoIdentifier('owner@example.com')).toBe(true);
  });

  it('normalises phone numbers written with +91, spaces or dashes', () => {
    // The variable may be written naturally; the app stores bare digits.
    process.env.DEMO_IDENTIFIERS = '+91 98765-43210';
    expect(isDemoIdentifier('9876543210')).toBe(true);
  });

  it('does not match on a prefix or substring', () => {
    process.env.DEMO_IDENTIFIERS = 'owner@example.com';

    expect(isDemoIdentifier('owner@example.com.attacker.net')).toBe(false);
    expect(isDemoIdentifier('not-owner@example.com')).toBe(false);
    expect(isDemoIdentifier('owner@example.co')).toBe(false);
  });
});
