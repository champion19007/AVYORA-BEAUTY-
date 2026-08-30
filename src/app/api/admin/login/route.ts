import { NextResponse } from 'next/server';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  getAdminConfig,
  verifyPassword,
} from '@/lib/auth';

/**
 * Verifies admin credentials on the server and issues a signed session cookie.
 *
 * The credentials never reach the client bundle, and the cookie is httpOnly so
 * page scripts cannot read or forge it.
 */
export async function POST(request: Request) {
  // Brute force protection: without this the PBKDF2 hash is only as strong as
  // the number of guesses an attacker is allowed.
  const limit = await rateLimit('adminLogin', clientIp(request));
  if (!limit.allowed) {
    return tooManyRequests(limit, 'Too many sign-in attempts. Try again later.');
  }

  const config = getAdminConfig();

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
  if (!config) {
    await verifyPassword(password, 'pbkdf2:210000:AAAA:AAAA');
    return NextResponse.json(
      { error: 'Admin access is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const passwordOk = await verifyPassword(password, config.passwordHash);
  const usernameOk = username === config.username;

  if (!usernameOk || !passwordOk) {
    // One generic message: revealing which half was wrong helps an attacker
    // enumerate usernames.
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await createSessionToken(config.username, config.sessionSecret);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
