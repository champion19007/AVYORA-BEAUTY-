/** Messages for the `?error=` codes Auth.js adds when a Google sign-in is refused. */
const AUTH_ERRORS: Record<string, string> = {
  AccessDenied: 'Google has not verified the email on that Google account, so it cannot be used here. Sign in with your email instead.',
  OAuthAccountNotLinked: 'An account with that email already exists. Sign in with your email, then Google will work next time.',
  Default: 'Sign-in did not complete. Please try again.',
};

/**
 * The message for an error code from the URL, or null when there is none.
 * Own keys only: `?error=__proto__` or `?error=constructor` would otherwise
 * return an inherited object or function, which crashes the page when rendered.
 */
export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(AUTH_ERRORS, code) ? AUTH_ERRORS[code]! : AUTH_ERRORS.Default!;
}
