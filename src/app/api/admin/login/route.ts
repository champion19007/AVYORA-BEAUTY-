import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/security';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyPassword,
} from '@/lib/auth';
import { encodeSubject, findStaffCredential, staffCredentials } from '@/lib/staff-auth';

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

  // Brute force protection: without this the PBKDF2 hash is only as strong as
  // the number of guesses an attacker is allowed.
  const limit = await rateLimit('adminLogin', clientIp(request));
  if (!limit.allowed) {
    return tooManyRequests(limit, 'Too many sign-in attempts. Try again later.');
  }

  const secret = process.env.SESSION_SECRET;
  const configured = staffCredentials();

  let username = '';
  let password = '';
  try {
    const body = await request.json();
    username = typeof body?.username === 'string' ? body.username : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Fail closed when unconfigured, and do a comparison anyway so an
  // unconfigured deployment is not distinguishable by response time.
  if (configured.length === 0 || !secret || secret.length < 32) {
    await verifyPassword(password, 'pbkdf2:210000:AAAA:AAAA');
    return NextResponse.json(
      { error: 'Staff access is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const credential = findStaffCredential(username);

  // Always hash something, so a wrong username does not answer faster than a
  // wrong password and hand back a way to enumerate the two staff logins.
  const passwordOk = await verifyPassword(
    password,
    credential?.passwordHash ?? 'pbkdf2:210000:AAAA:AAAA'
  );

  if (!credential || !passwordOk) {
    // One generic message: revealing which half was wrong helps an attacker
    // enumerate usernames.
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await createSessionToken(
    encodeSubject(credential.role, credential.username),
    secret
  );

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
