import { reportError } from '@/lib/observability';

/**
 * Delivery of one-time codes, by email and SMS.
 *
 * Both providers are optional and the app must run without either, the same
 * way it runs without Razorpay. What must never happen is a sign-in method
 * being offered in the interface when its delivery channel cannot actually
 * send — a customer typing their number and waiting for an SMS that no one is
 * sending is worse than not offering the option. `emailDeliveryConfigured()`
 * and `smsDeliveryConfigured()` gate the UI for exactly that reason.
 *
 * Deliberately thin. There is no queue and no retry: a code is only useful for
 * ten minutes, so a failed send should surface immediately and let the
 * customer ask for another, not sit in a queue until the code is stale.
 */

export type DeliveryResult = { ok: true } | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Email — Resend                                                              */
/* -------------------------------------------------------------------------- */

export function emailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends a transactional email through Resend.
 *
 * Resend rather than SMTP because a serverless function cannot hold an SMTP
 * connection open sensibly, and an HTTPS call needs no extra egress rules
 * after the AWS move. Swapping to SES later is a change to this function only.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<DeliveryResult> {
  if (!emailDeliveryConfigured()) {
    return { ok: false, error: 'Email delivery is not configured on this deployment.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
      // A hanging provider must not hang the sign-in form.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      reportError(new Error(`Resend responded ${response.status}`), {
        scope: 'notify.email',
        // Never the recipient address: this goes to an error tracker.
        extra: { status: response.status, detail: detail.slice(0, 200) },
      });
      return { ok: false, error: 'We could not send that email. Please try again.' };
    }

    return { ok: true };
  } catch (err) {
    reportError(err, { scope: 'notify.email' });
    return { ok: false, error: 'We could not send that email. Please try again.' };
  }
}

/* -------------------------------------------------------------------------- */
/* SMS — MSG91                                                                 */
/* -------------------------------------------------------------------------- */

export function smsDeliveryConfigured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
}

/**
 * Sends an OTP by SMS through MSG91.
 *
 * MSG91 rather than Twilio because transactional SMS to Indian numbers must go
 * through a DLT-registered sender and a pre-approved template — a TRAI
 * requirement, not a provider one. MSG91 is an Indian provider that handles
 * that registration path; a foreign gateway will simply have messages dropped
 * by the carriers.
 *
 * Consequently the message body is NOT free text. `MSG91_OTP_TEMPLATE_ID`
 * identifies the approved template and only the variables are supplied here.
 */
export async function sendOtpSms(phone: string, code: string): Promise<DeliveryResult> {
  if (!smsDeliveryConfigured()) {
    return { ok: false, error: 'SMS delivery is not configured on this deployment.' };
  }

  // MSG91 expects the country code without a plus.
  const mobile = phone.startsWith('+') ? phone.slice(1) : `91${phone}`;

  try {
    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        authkey: process.env.MSG91_AUTH_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: process.env.MSG91_OTP_TEMPLATE_ID,
        mobile,
        otp: code,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => ({}))) as { type?: string; message?: string };

    // MSG91 answers 200 with {"type":"error"} for a rejected send, so the
    // status code alone is not proof of delivery.
    if (!response.ok || body.type === 'error') {
      reportError(new Error(`MSG91 rejected send: ${body.message ?? response.status}`), {
        scope: 'notify.sms',
        extra: { status: response.status },
      });
      return { ok: false, error: 'We could not send that code. Please try again.' };
    }

    return { ok: true };
  } catch (err) {
    reportError(err, { scope: 'notify.sms' });
    return { ok: false, error: 'We could not send that code. Please try again.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Message bodies                                                              */
/* -------------------------------------------------------------------------- */

/** The email carrying a password-reset code. */
export function resetEmailBody(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is your Avyora password reset code`,
    text: [
      `Use ${code} to set a new Avyora password.`,
      '',
      'It expires in 10 minutes and can be used once.',
      '',
      'If you did not ask to reset your password, ignore this email — your',
      'current password still works and nothing has changed.',
    ].join('\n'),
  };
}

/** The email carrying a sign-in code. */
export function otpEmailBody(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is your Avyora sign-in code`,
    text: [
      `Your Avyora sign-in code is ${code}.`,
      '',
      'It expires in 10 minutes and can be used once.',
      'If you did not ask to sign in, you can ignore this email — nobody can',
      'use this code without it.',
    ].join('\n'),
  };
}
