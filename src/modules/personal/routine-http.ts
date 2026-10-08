import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { db } from '@/db';
import { PRIVATE_CACHE_CONTROL } from '@/lib/cache-policy';
import { GUEST_OWNER_COOKIE, hashGuestSecret, type Owner } from '@/lib/guest-owner';
import type { Subject } from '@/lib/rate-limit';
import { claimGuestRecords } from './routines';

/**
 * Shared pieces of the private routine and consent routes: one error shape
 * (spec section 20: code, message, requestId, optional fieldErrors), private
 * no-store headers on every response, and owner resolution. Server-only.
 */

const headers = { 'Content-Type': 'application/json', 'Cache-Control': PRIVATE_CACHE_CONTROL, Vary: 'Cookie' };

export function privateJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra: { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> } = {}
): Response {
  return privateJson({ error: { code, message, requestId: crypto.randomUUID(), ...extra } }, status);
}

/**
 * The signed-in account, else the guest proven by the HttpOnly owner
 * cookie, else null. A signed-in request that still carries a guest cookie
 * claims the guest's records for the account first (atomically) and drops
 * the cookie; if the claim fails, nothing moved and the cookie stays so the
 * next request retries.
 */
export async function resolveOwner(): Promise<Owner | null> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;
  const jar = await cookies();
  const guestHash = hashGuestSecret(jar.get(GUEST_OWNER_COOKIE)?.value);
  if (userId) {
    if (guestHash) {
      try {
        await claimGuestRecords(db, userId, guestHash);
        jar.delete(GUEST_OWNER_COOKIE);
      } catch (err) {
        console.error('guest record claim failed (will retry)', err);
      }
    }
    return { kind: 'user', userId };
  }
  return guestHash ? { kind: 'guest', ownerHash: guestHash } : null;
}

export const limiterSubject = (owner: Owner): Subject =>
  owner.kind === 'user' ? { kind: 'user', id: owner.userId } : { kind: 'guest', ownerHash: owner.ownerHash };
