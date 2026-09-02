'use server';

import { headers } from 'next/headers';
import { isDatabaseConfigured } from '@/db';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  accountMethods,
  emailSchema,
  passwordSchema,
  phoneSchema,
  findOrCreateByEmail,
  findOrCreateByPhone,
  setPasswordByEmail,
  signInWithPassword,
  signUpWithPassword,
  type AccountMethods,
} from '@/lib/customer-accounts';
import { createCustomerSession } from '@/lib/customer-session';
import { isDemoIdentifier } from '@/lib/demo-access';
import { issueOtp, verifyOtp } from '@/lib/otp';
import {
  emailDeliveryConfigured,
  otpEmailBody,
  resetEmailBody,
  sendEmail,
  sendOtpSms,
  smsDeliveryConfigured,
} from '@/lib/notify';

/**
 * Customer sign-in actions: password, email code, and phone code.
 *
 * Every entry point here is rate limited by IP before it touches the database.
 * These are the endpoints an attacker actually reaches for — password
 * guessing, address enumeration, and OTP spam that costs real money per SMS —
 * and they run in Node, where the durable Postgres counter works.
 */

/** Best-effort client address; the platform overwrites these at the edge. */
async function clientAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

export type ActionState = {
  error?: string;
  /** Set when a code was sent, so the form can move to the code step. */
  sent?: boolean;
  /** Set on success, so the client navigates. */
  done?: boolean;
  methods?: AccountMethods;
  /**
   * The code itself, shown on screen.
   *
   * Only ever populated for an allowlisted demo identifier whose delivery
   * channel is unavailable — see lib/demo-access.ts. Never set otherwise.
   */
  demoCode?: string;
};

const UNAVAILABLE: ActionState = {
  error: 'Sign-in is not available on this deployment.',
};

/* -------------------------------------------------------------------------- */
/* Which methods does this email support?                                      */
/* -------------------------------------------------------------------------- */

/**
 * Drives the email-first flow: enter an email, then be shown only the ways
 * that email can actually sign in.
 *
 * Rate limited harder than the sign-in itself, because this is the call that
 * would be used to grind a list of addresses.
 */
export async function lookupAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const limit = await rateLimit('accountLookup', await clientAddress());
  if (!limit.allowed) {
    return { error: 'Too many attempts. Please wait a minute and try again.' };
  }

  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const methods = await accountMethods(parsed.data);
  return { methods };
}

/* -------------------------------------------------------------------------- */
/* Password                                                                    */
/* -------------------------------------------------------------------------- */

export async function passwordSignIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const limit = await rateLimit('customerLogin', await clientAddress());
  if (!limit.allowed) {
    return { error: 'Too many sign-in attempts. Please wait and try again.' };
  }

  const email = emailSchema.safeParse(formData.get('email'));
  const password = String(formData.get('password') ?? '');

  if (!email.success) return { error: email.error.issues[0]!.message };
  if (!password) return { error: 'Enter your password.' };

  const result = await signInWithPassword(email.data, password);

  if (!result.ok) {
    // An account that only has Google gets told so, rather than being left to
    // guess at a password it never had.
    if (result.reason === 'no_password') {
      return { error: 'This account uses Google sign-in. Continue with Google instead.' };
    }
    return { error: 'That email and password do not match.' };
  }

  await createCustomerSession(result.userId);
  return { done: true };
}

export async function passwordSignUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const limit = await rateLimit('customerLogin', await clientAddress());
  if (!limit.allowed) return { error: 'Too many attempts. Please wait and try again.' };

  const email = emailSchema.safeParse(formData.get('email'));
  const password = passwordSchema.safeParse(formData.get('password'));
  const name = String(formData.get('name') ?? '').trim() || null;

  if (!email.success) return { error: email.error.issues[0]!.message };
  if (!password.success) return { error: password.error.issues[0]!.message };

  const result = await signUpWithPassword(email.data, password.data, name);

  if (!result.ok) {
    return { error: 'An account with that email already exists. Sign in instead.' };
  }

  await createCustomerSession(result.userId);
  return { done: true };
}

/* -------------------------------------------------------------------------- */
/* One-time codes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Sends a code to an email address or a phone number.
 *
 * Rate limited on the identifier as well as the IP: without that, someone can
 * send a stranger a code every few seconds from a rotating set of addresses,
 * which is both harassment and, over SMS, a bill.
 */
export async function requestCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const channel = formData.get('channel') === 'sms' ? 'sms' : 'email';

  const parsed =
    channel === 'sms'
      ? phoneSchema.safeParse(formData.get('phone'))
      : emailSchema.safeParse(formData.get('email'));

  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const identifier = parsed.data;

  // A working provider is always preferred. Only when there is none does the
  // demo allowlist come into play, and only for an identifier on it.
  const channelLive = channel === 'sms' ? smsDeliveryConfigured() : emailDeliveryConfigured();
  const reveal = !channelLive && isDemoIdentifier(identifier);

  if (!channelLive && !reveal) {
    return {
      error:
        channel === 'sms'
          ? 'SMS codes are not available on this deployment.'
          : 'Email codes are not available on this deployment.',
    };
  }

  const byIp = await rateLimit('otpRequest', await clientAddress());
  if (!byIp.allowed) return { error: 'Too many requests. Please wait a minute.' };

  const byIdentifier = await rateLimit('otpRequest', `id:${identifier}`);
  if (!byIdentifier.allowed) {
    return { error: 'A code was just sent. Please wait before asking for another.' };
  }

  const code = await issueOtp(identifier, channel);

  if (reveal) return { sent: true, demoCode: code };

  const delivery =
    channel === 'sms'
      ? await sendOtpSms(identifier, code)
      : await (async () => {
          const body = otpEmailBody(code);
          return sendEmail(identifier, body.subject, body.text);
        })();

  if (!delivery.ok) return { error: delivery.error };

  return { sent: true };
}

/** Checks a code and signs the customer in, creating the account if new. */
export async function verifyCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const limit = await rateLimit('customerLogin', await clientAddress());
  if (!limit.allowed) return { error: 'Too many attempts. Please wait and try again.' };

  const channel = formData.get('channel') === 'sms' ? 'sms' : 'email';

  const parsed =
    channel === 'sms'
      ? phoneSchema.safeParse(formData.get('phone'))
      : emailSchema.safeParse(formData.get('email'));

  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const code = String(formData.get('code') ?? '').trim();
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code.', sent: true };

  const result = await verifyOtp(parsed.data, code);

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'That code has expired. Ask for a new one.'
        : result.reason === 'too_many_attempts'
          ? 'Too many wrong attempts. Ask for a new code.'
          : 'That code is not right.';
    // Keep the form on the code step so the customer can retry or resend.
    return { error: message, sent: true };
  }

  const userId =
    channel === 'sms'
      ? await findOrCreateByPhone(parsed.data)
      : await findOrCreateByEmail(parsed.data);

  await createCustomerSession(userId);
  return { done: true };
}

/* -------------------------------------------------------------------------- */
/* Forgotten password                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Sends a reset code.
 *
 * Answers the same way whether or not the address has an account. Saying "no
 * account with that email" here would turn the reset form into an enumeration
 * oracle that bypasses the rate limits on the lookup — and someone who mistyped
 * their address learns nothing useful from the difference anyway.
 *
 * Resetting requires proving control of the inbox, so this is unavailable when
 * email delivery is not configured. There is no honest alternative: a reset
 * that does not verify the inbox is a way to take over accounts.
 */
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  // A working provider wins; otherwise the demo allowlist decides, so a reset
  // can be shown on a deployment whose sending domain is not verified yet.
  const reveal = !emailDeliveryConfigured() && isDemoIdentifier(parsed.data);

  if (!emailDeliveryConfigured() && !reveal) {
    return { error: 'Password reset is not available on this deployment. Try Google sign-in.' };
  }

  const byIp = await rateLimit('otpRequest', await clientAddress());
  if (!byIp.allowed) return { error: 'Too many requests. Please wait a minute.' };

  const byIdentifier = await rateLimit('otpRequest', `reset:${parsed.data}`);
  if (!byIdentifier.allowed) {
    return { error: 'A code was just sent. Please wait before asking for another.' };
  }

  const methods = await accountMethods(parsed.data);

  // Only actually send when there is something to reset. The response below is
  // identical either way, so this costs the sender nothing and tells an
  // attacker nothing.
  if (methods.exists) {
    const code = await issueOtp(parsed.data, 'email');

    if (reveal) return { sent: true, demoCode: code };

    const body = resetEmailBody(code);
    const delivery = await sendEmail(parsed.data, body.subject, body.text);
    if (!delivery.ok) return { error: delivery.error };
  }

  return { sent: true };
}

/** Checks the reset code and sets the new password. */
export async function resetPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;

  const limit = await rateLimit('customerLogin', await clientAddress());
  if (!limit.allowed) return { error: 'Too many attempts. Please wait and try again.', sent: true };

  const email = emailSchema.safeParse(formData.get('email'));
  const password = passwordSchema.safeParse(formData.get('password'));

  if (!email.success) return { error: email.error.issues[0]!.message, sent: true };
  if (!password.success) return { error: password.error.issues[0]!.message, sent: true };

  const code = String(formData.get('code') ?? '').trim();
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code.', sent: true };

  const result = await verifyOtp(email.data, code);

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'That code has expired. Ask for a new one.'
        : result.reason === 'too_many_attempts'
          ? 'Too many wrong attempts. Ask for a new code.'
          : 'That code is not right.';
    return { error: message, sent: true };
  }

  const changed = await setPasswordByEmail(email.data, password.data);
  if (!changed) return { error: 'That account could not be found.', sent: true };

  // Signing in immediately is safe: the code just proved inbox control, which
  // is the same proof the reset itself rests on.
  await createCustomerSession(changed);
  return { done: true };
}
