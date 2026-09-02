import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users, accounts } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth';

/**
 * Customer account records: lookup, creation, and password checking.
 *
 * Kept separate from `auth.ts` (which configures Auth.js and its Google
 * provider) because these functions are the ones the password and OTP flows
 * use, and those deliberately do not go through Auth.js — see
 * `customer-session.ts` for why.
 */

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const passwordSchema = z
  .string()
  // Length is the only rule. Composition requirements ("one capital, one
  // symbol") push people toward Password1! and away from long passphrases,
  // which are stronger; NIST dropped them for that reason.
  .min(10, 'Use at least 10 characters')
  .max(200, 'That password is too long');

/** Indian mobile numbers, stored as bare ten digits to match the address book. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'));

/** What sign-in methods an account actually supports. */
export type AccountMethods = {
  exists: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
};

/**
 * Which ways this email can sign in.
 *
 * This is the account-enumeration trade-off, made deliberately. Telling a
 * visitor "no account with that email" leaks which addresses are registered,
 * and someone can grind a list to find out who shops here. Refusing to say
 * costs every real customer a worse experience: they cannot tell whether to
 * sign in or sign up, and someone who registered with Google is shown a
 * password box that will never work for them.
 *
 * The leak is accepted, and paid for in three ways:
 *   - the route calling this is rate-limited per IP, so a list cannot be
 *     ground through quickly;
 *   - it returns which *methods* exist, never the name, phone or any other
 *     detail attached to the account;
 *   - password verification below runs in constant-ish time whether or not the
 *     account exists, so timing does not leak what this call declines to.
 */
export async function accountMethods(email: string): Promise<AccountMethods> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return { exists: false, hasPassword: false, hasGoogle: false };

  const [google] = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.provider, 'google')))
    .limit(1);

  return {
    exists: true,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(google),
  };
}

export type PasswordSignInResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'no_password' };

/**
 * Checks an email and password.
 *
 * When the account does not exist, or exists without a password, a hash is
 * still verified against a dummy value. Skipping that would return "wrong
 * password" measurably faster for unknown emails than for known ones, which
 * hands back exactly the enumeration signal we are trying to bound elsewhere.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<PasswordSignInResult> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user?.passwordHash) {
    // Burn comparable time, then answer.
    await verifyPassword(password, await getDummyHash());
    return { ok: false, reason: user ? 'no_password' : 'invalid' };
  }

  const matches = await verifyPassword(password, user.passwordHash);
  return matches ? { ok: true, userId: user.id } : { ok: false, reason: 'invalid' };
}

/**
 * A real PBKDF2 hash of a value nobody knows, used only to spend time on the
 * unknown-account path.
 *
 * Computed on first use and cached, not at module load: 210,000 iterations is
 * deliberately slow, and paying that during module initialisation would delay
 * every cold start of every route that imports this file, including ones that
 * never check a password.
 */
let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}

export type SignUpResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'email_taken' };

/** Creates an account with a password. */
export async function signUpWithPassword(
  email: string,
  password: string,
  name: string | null
): Promise<SignUpResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) return { ok: false, reason: 'email_taken' };

  const passwordHash = await hashPassword(password);

  const [row] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning({ id: users.id });

  return { ok: true, userId: row!.id };
}

/**
 * Finds the account for a verified email, creating one if needed.
 *
 * Used by email OTP: possession of the inbox is proof enough to sign in, and
 * for a first-time visitor it is also proof enough to register — requiring a
 * separate sign-up step after they have already proved the same thing would be
 * ceremony, not security. `emailVerified` is stamped because that is precisely
 * what the code proved.
 */
export async function findOrCreateByEmail(email: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(users)
    .values({ email, emailVerified: new Date() })
    .returning({ id: users.id });

  return row!.id;
}

/**
 * Finds the account for a verified phone number, creating one if needed.
 *
 * Phone-only accounts have no email, but the column is NOT NULL because the
 * Auth.js adapter requires it. A namespaced placeholder satisfies that without
 * pretending to be a real address — it is never sent to, and a customer who
 * later signs in with Google gets a separate account rather than silently
 * taking over this one. Linking the two is a deliberate action for later, not
 * something to guess at here.
 */
export async function findOrCreateByPhone(phone: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing) {
    await db.update(users).set({ phoneVerified: new Date() }).where(eq(users.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(users)
    .values({
      email: `phone-${phone}@no-email.avyora.local`,
      phone,
      phoneVerified: new Date(),
    })
    .returning({ id: users.id });

  return row!.id;
}

/** Sets or replaces a password on an existing account. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
}
