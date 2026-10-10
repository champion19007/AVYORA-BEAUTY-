'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { createOrder, type CheckoutInput } from '@/lib/orders';
import { createOrderAccessToken } from '@/lib/order-access';
import { limit, limitMessage } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { findByIdempotencyKey } from '@/lib/orders';
import { checkSmsCode, sendSmsCode } from '@/lib/sms-code';
import { guestPhoneCheckRequired, normalisePhone, signPhoneProof } from '@/lib/checkout-phone';

/**
 * Places an order.
 *
 * Runs on the server so prices, totals and validation cannot be tampered with
 * from the browser. The signed-in user is read from the session rather than
 * taken from the request body, so an order cannot be attributed to someone else.
 */
export type PlaceOrderResult =
  | { ok: true; orderNumber: string; accessToken: string | null }
  | { ok: false; error: string; code?: 'price_changed' | 'phone_unverified' };

export async function placeOrder(input: CheckoutInput): Promise<PlaceOrderResult> {
  // Server actions receive no Request object, so the address comes from the
  // incoming headers instead.
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: 'Checkout is not available yet: this deployment has no database configured.',
    };
  }

  const session = await auth().catch(() => null);
  const address = trustedClientIp(await headers());
  const email = typeof input?.email === 'string' ? input.email : '';
  const limited = await limit([
    { policy: 'checkout', subject: { kind: 'ip', address } },
    session?.user?.id
      ? { policy: 'checkout', subject: { kind: 'user', id: session.user.id } }
      : { policy: 'checkout', subject: { kind: 'identifier', value: email } },
  ]);
  if (!limited.allowed) {
    // A retry of an order that already exists is a replay, not new work:
    // answer it rather than refusing a customer whose order went through.
    const replay = input?.idempotencyKey ? await findByIdempotencyKey(String(input.idempotencyKey)) : null;
    if (!replay) return { ok: false, error: limitMessage(limited) };
  }

  const result = await createOrder(input, session?.user?.id ?? null);
  if (!result.ok) return result;

  // Guests have no account to authenticate against, so they carry a signed
  // token that authorises this order and no other.
  const accessToken = await createOrderAccessToken(result.orderNumber);
  return { ok: true, orderNumber: result.orderNumber, accessToken };
}

/*
 * Guest checkout: prove the delivery number with an SMS code.
 * See lib/checkout-phone.ts for why and when this is asked.
 */

export type PhoneCodeResult = { ok: true } | { ok: false; error: string };
export type PhoneVerifyResult = { ok: true; proof: string } | { ok: false; error: string };

const VALID_MOBILE = /^[6-9]\d{9}$/;

export async function sendCheckoutCode(rawPhone: string): Promise<PhoneCodeResult> {
  const session = await auth().catch(() => null);
  if (!guestPhoneCheckRequired(session?.user?.id)) return { ok: false, error: 'Mobile verification is not needed here.' };

  const phone = normalisePhone(String(rawPhone ?? ''));
  if (!VALID_MOBILE.test(phone)) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number' };

  // Same budget as sign-in codes: each SMS costs money.
  const address = trustedClientIp(await headers());
  const limited = await limit(
    (['otpSend', 'otpResend'] as const).flatMap((policy) => [
      { policy, subject: { kind: 'ip' as const, address } },
      { policy, subject: { kind: 'identifier' as const, value: phone } },
    ])
  );
  if (!limited.allowed) return { ok: false, error: limitMessage(limited) };

  const sent = await sendSmsCode(phone);
  return sent.ok ? { ok: true } : { ok: false, error: sent.error };
}

const VERIFY_ERRORS = {
  expired: 'That code has expired. Ask for a new one.',
  invalid: 'That code is not right. Check it and try again.',
  too_many_attempts: 'Too many wrong codes. Ask for a new one.',
} as const;

export async function verifyCheckoutCode(rawPhone: string, rawCode: string): Promise<PhoneVerifyResult> {
  const phone = normalisePhone(String(rawPhone ?? ''));
  const code = String(rawCode ?? '').trim();
  if (!VALID_MOBILE.test(phone) || !/^\d{6}$/.test(code)) return { ok: false, error: 'Enter the 6-digit code.' };

  // Same guard as sign-in's code check: a code allows five guesses, this caps how fast they come.
  const limited = await limit([
    { policy: 'login', subject: { kind: 'ip', address: trustedClientIp(await headers()) } },
    { policy: 'login', subject: { kind: 'identifier', value: phone } },
  ]);
  if (!limited.allowed) return { ok: false, error: limitMessage(limited) };

  const result = await checkSmsCode(phone, code);
  if (!result.ok) return { ok: false, error: VERIFY_ERRORS[result.reason] };
  return { ok: true, proof: await signPhoneProof(phone) };
}
