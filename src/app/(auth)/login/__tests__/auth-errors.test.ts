import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../auth-errors';

describe('authErrorMessage', () => {
  it('is null when the URL has no error', () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage('')).toBeNull();
  });

  it('explains the codes Auth.js sends', () => {
    expect(authErrorMessage('AccessDenied')).toMatch(/not verified the email/);
    expect(authErrorMessage('OAuthAccountNotLinked')).toMatch(/already exists/);
  });

  it.each(['Configuration', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'falls back to the default message for %s, never an inherited value',
    (code) => {
      const message = authErrorMessage(code);
      expect(typeof message).toBe('string');
      expect(message).toBe('Sign-in did not complete. Please try again.');
    }
  );
});
