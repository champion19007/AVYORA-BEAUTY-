/**
 * Server-side admin authentication.
 *
 * Replaces a client-side credential check. Previously `login/page.tsx`
 * compared the username and password in the browser, so both values shipped
 * inside the JavaScript bundle every visitor downloads, and the `/admin` gate
 * was a client-side redirect that anyone could skip by setting
 * `localStorage.user` to `{"isAdmin":true}`.
 *
 * Now: credentials live in environment variables, the password is stored as a
 * PBKDF2 hash, and access is carried by an HMAC-signed httpOnly cookie that
 * middleware verifies before any admin route renders.
 *
 * Built on Web Crypto so the same code runs in the edge middleware runtime and
 * in route handlers.
 */

export const SESSION_COOKIE = 'avyora_admin_session';

/** Eight hours. Long enough for a shift, short enough to limit exposure. */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

const encoder = new TextEncoder();

/* -------------------------------------------------------------------------- */
/* Encoding helpers                                                            */
/* -------------------------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Constant-time comparison. A plain `===` on secrets leaks their contents
 * through response timing.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/* Password hashing                                                            */
/* -------------------------------------------------------------------------- */

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

/**
 * Produces a storable hash string: `pbkdf2:<iterations>:<salt>:<hash>`.
 *
 * Colon-separated rather than `$`-separated because `$` is a variable
 * expansion sigil in .env files: a `$`-delimited hash is silently mangled on
 * load, and the resulting failure looks like a wrong password. base64url
 * never contains a colon, so the format stays unambiguous.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

/** Verifies a password against a stored hash. Never throws on malformed input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split(':');
    if (scheme !== 'pbkdf2') return false;

    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations < 1000) return false;

    const expected = fromBase64Url(hashRaw);
    const actual = await pbkdf2(password, fromBase64Url(saltRaw), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Session tokens                                                              */
/* -------------------------------------------------------------------------- */

type SessionPayload = { sub: string; exp: number };

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Signs a session token as `<payload>.<signature>`. */
export async function createSessionToken(subject: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies signature and expiry. Returns the payload, or null for anything
 * malformed, tampered with, or expired.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

export type AdminConfig = { username: string; passwordHash: string; sessionSecret: string };

/**
 * Reads admin credentials from the environment.
 *
 * Returns null when anything is missing, so authentication **fails closed**:
 * an unconfigured deployment rejects every admin login rather than accepting
 * any.
 */
export function getAdminConfig(): AdminConfig | null {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!username || !passwordHash || !sessionSecret) return null;
  if (sessionSecret.length < 32) return null;

  return { username, passwordHash, sessionSecret };
}
