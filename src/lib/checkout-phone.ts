import { createSessionToken, verifySessionToken } from '@/lib/auth';
import { smsDeliveryConfigured } from '@/lib/notify';

/**
 * Guest checkout proves the delivery mobile number with an SMS code.
 *
 * Verifying returns a signed proof for that number (valid 8 hours, the session
 * lifetime); `createOrder` refuses a guest order whose delivery number has no
 * matching proof, so the check cannot be skipped by calling the API directly.
 * Signed-in customers are not asked: they already proved who they are. With no
 * SMS provider configured there is nothing to verify with, so it is not asked
 * either, rather than making checkout impossible.
 */

/** Ten digits, as `addressSchema` and `phoneSchema` normalise it. */
export const normalisePhone = (raw: string) => raw.trim().replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');

// Its own key: a phone proof must never verify as any other signed token (staff sessions share SESSION_SECRET).
const proofKey = () => `${process.env.SESSION_SECRET}:checkout-phone`;

export const guestPhoneCheckRequired = (userId: string | null | undefined) =>
  !userId && smsDeliveryConfigured() && Boolean(process.env.SESSION_SECRET);

export const signPhoneProof = (phone: string) => createSessionToken(normalisePhone(phone), proofKey());

export async function phoneProofValid(token: string | undefined, phone: string): Promise<boolean> {
  const payload = await verifySessionToken(token, proofKey());
  return payload?.sub === normalisePhone(phone);
}
