import {
  checkTwilioVerification,
  sendOtpSms,
  startTwilioVerification,
  twilioVerifyConfigured,
  type DeliveryResult,
} from '@/lib/notify';
import { issueOtp, verifyOtp, type OtpVerifyResult } from '@/lib/otp';

/**
 * SMS codes, wherever they are used (sign-in, guest checkout).
 *
 * With Twilio Verify on, Twilio generates, sends and checks the code; our code
 * table is not involved. Otherwise the code is ours (lib/otp.ts: hashed, five
 * attempts, single use) and a plain SMS provider delivers it. Callers make the
 * same two calls either way.
 */
export async function sendSmsCode(phone: string): Promise<DeliveryResult> {
  if (twilioVerifyConfigured()) return startTwilioVerification(phone);
  return sendOtpSms(phone, await issueOtp(phone, 'sms'));
}

export async function checkSmsCode(phone: string, code: string): Promise<OtpVerifyResult> {
  if (!twilioVerifyConfigured()) return verifyOtp(phone, code);
  const result = await checkTwilioVerification(phone, code);
  return result === 'approved' ? { ok: true } : { ok: false, reason: result };
}
