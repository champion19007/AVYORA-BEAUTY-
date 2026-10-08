import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Guest ownership of personal records.
 *
 * A guest proves ownership with a secret: 32 random bytes generated here, on
 * the server, sent only as an HttpOnly cookie. The database stores only its
 * SHA-256 (`anonymous_owner_hash`), so a leaked table cannot be replayed as a
 * cookie. Plain SHA-256 is enough because the secret has 256 bits of entropy;
 * there is nothing to brute-force.
 *
 * Deliberately separate from the cart cookie (`avyora_cart_id`): that id is a
 * convenience key for a basket and was stored in plaintext beside saved quiz
 * answers before migration 0016. It is never accepted as proof of anything.
 */
export const GUEST_OWNER_COOKIE = 'avyora_owner';

/** Guest records live at most 30 days (spec section 22), and so does the cookie. */
export const GUEST_OWNER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export type Owner = { kind: 'user'; userId: string } | { kind: 'guest'; ownerHash: string };

export function newGuestSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form of a secret, or null if the value is not one we issued. */
export function hashGuestSecret(secret: string | undefined | null): string | null {
  if (!secret || !SECRET_SHAPE.test(secret)) return null;
  return createHash('sha256').update(secret).digest('hex');
}

/** Owner columns for an insert: exactly one of the two is set. */
export function ownerColumns(owner: Owner): { userId: string | null; anonymousOwnerHash: string | null } {
  return owner.kind === 'user'
    ? { userId: owner.userId, anonymousOwnerHash: null }
    : { userId: null, anonymousOwnerHash: owner.ownerHash };
}

/** The current guest's owner hash, if they hold a valid secret. Never creates one. */
export async function currentGuestOwnerHash(): Promise<string | null> {
  return hashGuestSecret((await cookies()).get(GUEST_OWNER_COOKIE)?.value);
}

/**
 * The current guest's owner hash, issuing a secret first if they have none.
 * Only for server actions and route handlers (setting a cookie needs one),
 * and only when the guest is about to own something, e.g. on granting consent.
 */
export async function ensureGuestOwnerHash(): Promise<string> {
  const jar = await cookies();
  const existing = hashGuestSecret(jar.get(GUEST_OWNER_COOKIE)?.value);
  if (existing) return existing;

  const secret = newGuestSecret();
  jar.set(GUEST_OWNER_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_OWNER_MAX_AGE_SECONDS,
  });
  return hashGuestSecret(secret)!;
}
