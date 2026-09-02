import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { otpCodes } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth';

/**
 * One-time codes for email and SMS sign-in.
 *
 * Design notes, because each of these is a way this goes wrong:
 *
 *  - **Codes are stored hashed.** A six-digit code is a credential for the few
 *    minutes it lives. A database backup, a log line, or an admin browsing the
 *    table should not hand over a live login.
 *
 *  - **Attempts are counted.** A million possible codes is not many: without a
 *    cap, an attacker can simply try them all against a known email. Five
 *    wrong guesses burns the code.
 *
 *  - **A code is consumed exactly once**, marked in the same statement that
 *    validates it, so two simultaneous requests cannot both succeed.
 *
 *  - **Requesting a new code invalidates the old one**, so a code read over
 *    someone's shoulder is dead the moment a fresh one is asked for.
 */

/** Long enough to arrive and be typed; short enough that a stolen code expires. */
const OTP_TTL_SECONDS = 10 * 60;

/** Wrong guesses before the code is burned. */
const MAX_ATTEMPTS = 5;

export type OtpChannel = 'email' | 'sms';

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' | 'too_many_attempts' };

/**
 * A six-digit code from a cryptographic source.
 *
 * `Math.random()` is not acceptable here — it is predictable from prior
 * outputs, and this value is a credential.
 */
function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]!;
  // Rejection-free modulo bias is negligible at this range, and a biased digit
  // does not meaningfully help an attacker who only gets five guesses.
  return String(n % 1_000_000).padStart(6, '0');
}

/**
 * Issues a code for an identifier, returning the plaintext to send.
 *
 * The caller delivers it; this module never sends anything itself, so the
 * delivery channel can fail without leaving a half-created code behind.
 */
export async function issueOtp(identifier: string, channel: OtpChannel): Promise<string> {
  const code = generateCode();
  const codeHash = await hashPassword(code);

  await db.transaction(async (tx) => {
    // Supersede any live code for this identifier.
    await tx
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.identifier, identifier), isNull(otpCodes.consumedAt)));

    await tx.insert(otpCodes).values({
      identifier,
      channel,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });
  });

  return code;
}

/**
 * Checks a code and consumes it on success.
 *
 * Returns a reason rather than a bare boolean so the interface can say
 * "that code expired" instead of "wrong code" — the difference between a
 * customer retrying and a customer giving up.
 */
export async function verifyOtp(identifier: string, code: string): Promise<OtpVerifyResult> {
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.identifier, identifier),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(sql`${otpCodes.createdAt} desc`)
    .limit(1);

  if (!row) return { ok: false, reason: 'expired' };

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
    return { ok: false, reason: 'too_many_attempts' };
  }

  const matches = await verifyPassword(code, row.codeHash);

  if (!matches) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, row.id));

    // Report the burn immediately, rather than on the next attempt.
    if (row.attempts + 1 >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
    return { ok: false, reason: 'invalid' };
  }

  // Consume under a still-unconsumed guard, so a racing request cannot also
  // claim this code.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });

  if (consumed.length === 0) return { ok: false, reason: 'invalid' };

  return { ok: true };
}

/** Housekeeping: drops codes that are spent or long expired. */
export async function pruneExpiredOtps(): Promise<void> {
  await db.delete(otpCodes).where(sql`${otpCodes.expiresAt} < now() - interval '1 day'`);
}
