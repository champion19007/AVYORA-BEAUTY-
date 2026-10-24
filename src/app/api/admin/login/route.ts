import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/security';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { BODY_LIMITS, readBoundedJson } from '@/lib/request-body';
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifyPassword } from '@/lib/auth';
import { encodeSubject, findStaffCredential, staffCredentials } from '@/lib/staff-auth';
import { issueOtp, verifyOtp } from '@/lib/otp';
import { emailDeliveryConfigured, sendEmail } from '@/lib/notify';
import { isDatabaseConfigured } from '@/db';

/**
 * Two-step sign-in for the owner: after the password, a six-digit code sent to
 * OWNER_EMAIL. The owner console sets prices and sees every customer, so a
 * leaked password alone must not open it. On whenever the code can actually be
 * delivered; `OWNER_TWO_STEP=off` is the escape hatch if email ever breaks.
 */
function ownerTwoStepTarget(): string | null {
  if (process.env.OWNER_TWO_STEP === 'off') return null;
  const email = process.env.OWNER_EMAIL;
  return email && emailDeliveryConfigured() && isDatabaseConfigured() ? email : null;
}

/**
 * Verifies staff credentials and issues a signed session cookie.
 *
 * Serves both roles. The owner and the inventory manager sign in at the same
 * door; which console they land in is decided by the role baked into the
 * session subject, not by which URL they typed. That means a manager cannot
 * reach the owner's screens by guessing a path, and there is one login to
 * rate limit rather than two.
 *
 * The credentials never reach the client bundle, and the cookie is httpOnly so
 * page scripts cannot read or forge it.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const secret = process.env.SESSION_SECRET;
  const configured = staffCredentials();

  const read = await readBoundedJson(request, BODY_LIMITS.adminLogin);
  if (!read.ok) return read.response;
  const body = read.json as { username?: unknown; password?: unknown; code?: unknown } | undefined;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  // Brute force protection, per IP and per operator name: without it the
  // PBKDF2 hash is only as strong as the number of guesses allowed. Fails
  // closed: no limiter, no staff sign-in.
  const limited = await limit([
    { policy: 'adminLogin', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
    { policy: 'adminLogin', subject: { kind: 'identifier', value: username } },
  ]);
  if (!limited.allowed) return limitResponse(limited);

  // Fail closed when unconfigured, and do a comparison anyway so an
  // unconfigured deployment is not distinguishable by response time.
  if (configured.length === 0 || !secret || secret.length < 32) {
    await verifyPassword(password, 'pbkdf2:210000:AAAA:AAAA');
    return NextResponse.json({ error: 'Staff access is not configured on this deployment.' }, { status: 503 });
  }

  const credential = findStaffCredential(username);

  // Always hash something, so a wrong username does not answer faster than a
  // wrong password and hand back a way to enumerate the two staff logins.
  const passwordOk = await verifyPassword(password, credential?.passwordHash ?? 'pbkdf2:210000:AAAA:AAAA');

  if (!credential || !passwordOk) {
    // One generic message: revealing which half was wrong helps an attacker
    // enumerate usernames.
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const twoStep = credential.role === 'owner' ? ownerTwoStepTarget() : null;
  if (twoStep) {
    const identifier = `staff:${credential.username}`;
    if (!code) {
      const issued = await issueOtp(identifier, 'email');
      const sent = await sendEmail(
        twoStep,
        'Your Avyora sign-in code',
        `Your owner sign-in code is ${issued}. It expires in 10 minutes.\n\n` +
          'If you did not just try to sign in, someone has your password: change it now.'
      );
      if (!sent.ok) return NextResponse.json({ error: 'Could not send the sign-in code. Try again.' }, { status: 502 });
      return NextResponse.json({ step: 'code' });
    }
    const checked = /^\d{6}$/.test(code)
      ? await verifyOtp(identifier, code)
      : { ok: false as const, reason: 'invalid' };
    if (!checked.ok) {
      return NextResponse.json(
        {
          error:
            checked.reason === 'invalid'
              ? 'That code is not right.'
              : 'That code has expired. Sign in again for a new one.',
        },
        { status: 401 }
      );
    }
  }

  const token = await createSessionToken(encodeSubject(credential.role, credential.username), secret);

  // The client uses this to land on the right console.
  const response = NextResponse.json({ ok: true, role: credential.role });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
