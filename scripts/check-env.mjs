#!/usr/bin/env node
/**
 * Environment preflight.
 *
 * Run before a deploy, or against a freshly configured environment, to find
 * out what is missing or malformed *before* customers do.
 *
 * Every check here exists because the failure it catches actually happened, or
 * would be silent and expensive:
 *
 *   - A missing AUTH_SECRET makes /api/auth/session return 500 on every page,
 *     because SessionProvider polls it.
 *   - A localhost DATABASE_URL deployed to Vercel cannot be reached at all —
 *     the connection string that works on a laptop is the one most likely to
 *     be copied into production by mistake.
 *   - Reusing one secret for both AUTH_SECRET and SESSION_SECRET means one
 *     leak compromises customer sessions and the admin panel together.
 *
 * It never prints a secret. Values are reported by shape and length only, so
 * the output is safe to paste into a chat or an issue.
 *
 * Usage:
 *   npm run check:env               check the local .env.local
 *   npm run check:env -- --production   apply the stricter production rules
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PRODUCTION = process.argv.includes('--production');
const ENV_FILE = resolve(process.cwd(), '.env.local');

/* -------------------------------------------------------------------------- */
/* Loading                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reads .env.local without a dependency.
 *
 * Deliberately simple: `KEY=value`, everything after the first `=` is the
 * value, no quote stripping and no variable expansion. Expansion is what
 * mangled a `$` inside a PBKDF2 hash once already.
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return out;
}

// Real environment wins, so this works on a platform where nothing is on disk.
const fileEnv = loadEnvFile(ENV_FILE);
const env = (key) => process.env[key] || fileEnv[key] || '';

/* -------------------------------------------------------------------------- */
/* Reporting                                                                    */
/* -------------------------------------------------------------------------- */

const problems = [];
const warnings = [];
const ok = [];

const fail = (key, message) => problems.push(`${key}: ${message}`);
const warn = (key, message) => warnings.push(`${key}: ${message}`);
const pass = (key, note) => ok.push(`${key}${note ? ` (${note})` : ''}`);

/* -------------------------------------------------------------------------- */
/* Checks                                                                       */
/* -------------------------------------------------------------------------- */

// --- Database --------------------------------------------------------------
const databaseUrl = env('DATABASE_URL');

if (!databaseUrl) {
  fail('DATABASE_URL', 'not set — sign-in, carts, orders and inventory all need it');
} else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  fail('DATABASE_URL', 'is not a postgres:// or postgresql:// connection string');
} else {
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);

  if (PRODUCTION && isLocal) {
    fail(
      'DATABASE_URL',
      'points at localhost. A hosted deployment cannot reach a database on your laptop — use Neon, RDS or Aurora'
    );
  } else {
    pass('DATABASE_URL', isLocal ? 'local' : 'remote');

    // Transaction-mode poolers are what make many short-lived serverless
    // connections survivable; a direct URL exhausts the connection limit.
    if (PRODUCTION && /neon\.tech/.test(databaseUrl) && !/-pooler\./.test(databaseUrl)) {
      warn(
        'DATABASE_URL',
        'is a Neon direct connection. Use the pooled string (host contains "-pooler") for serverless'
      );
    }
  }
}

// --- Customer sign-in ------------------------------------------------------
const authSecret = env('AUTH_SECRET');

if (!authSecret) {
  fail('AUTH_SECRET', 'not set — /api/auth/session returns 500 on every page without it');
} else if (authSecret.length < 32) {
  fail('AUTH_SECRET', `only ${authSecret.length} characters; use at least 32`);
} else {
  pass('AUTH_SECRET', `${authSecret.length} chars`);
}

const googleId = env('AUTH_GOOGLE_ID');
const googleSecret = env('AUTH_GOOGLE_SECRET');

if (!googleId || !googleSecret) {
  warn(
    'AUTH_GOOGLE_ID/SECRET',
    'not set — Google sign-in is hidden and customers cannot create accounts'
  );
} else {
  if (!googleId.endsWith('.apps.googleusercontent.com')) {
    fail('AUTH_GOOGLE_ID', 'does not look like a Google client id');
  } else {
    pass('AUTH_GOOGLE_ID');
  }

  if (!googleSecret.startsWith('GOCSPX-')) {
    warn('AUTH_GOOGLE_SECRET', 'does not start with GOCSPX- — check it is the secret, not the id');
  } else {
    pass('AUTH_GOOGLE_SECRET', `${googleSecret.length} chars`);
  }
}

// --- Admin panel -----------------------------------------------------------
if (!env('ADMIN_USERNAME')) {
  warn('ADMIN_USERNAME', 'not set — the admin panel is unreachable');
} else {
  pass('ADMIN_USERNAME');
}

const passwordHash = env('ADMIN_PASSWORD_HASH');

if (!passwordHash) {
  warn('ADMIN_PASSWORD_HASH', 'not set — the admin panel is unreachable');
} else if (!/^pbkdf2:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(passwordHash)) {
  fail(
    'ADMIN_PASSWORD_HASH',
    'is malformed. Expected pbkdf2:<iterations>:<salt>:<hash> — regenerate with scripts/hash-password.mjs'
  );
} else {
  const iterations = Number(passwordHash.split(':')[1]);
  if (iterations < 100_000) {
    warn('ADMIN_PASSWORD_HASH', `only ${iterations} iterations; 210000 is the current default`);
  } else {
    pass('ADMIN_PASSWORD_HASH', `${iterations} iterations`);
  }
}

const sessionSecret = env('SESSION_SECRET');

if (!sessionSecret) {
  warn('SESSION_SECRET', 'not set — the admin panel is unreachable');
} else if (sessionSecret.length < 32) {
  fail('SESSION_SECRET', `only ${sessionSecret.length} characters; use at least 32`);
} else {
  pass('SESSION_SECRET', `${sessionSecret.length} chars`);
}

// One value doing two jobs means one leak costs both.
if (authSecret && sessionSecret && authSecret === sessionSecret) {
  fail('AUTH_SECRET/SESSION_SECRET', 'are identical. Use a different value for each');
}

// --- Payments --------------------------------------------------------------
const razorpayId = env('RAZORPAY_KEY_ID');
const razorpaySecret = env('RAZORPAY_KEY_SECRET');

if (!razorpayId || !razorpaySecret) {
  warn('RAZORPAY_KEY_ID/SECRET', 'not set — checkout offers cash on delivery only');
} else {
  pass('RAZORPAY_KEY_ID', razorpayId.startsWith('rzp_live_') ? 'LIVE mode' : 'test mode');

  if (PRODUCTION && razorpayId.startsWith('rzp_test_')) {
    warn('RAZORPAY_KEY_ID', 'is a test key in a production check — real payments will not be taken');
  }

  if (!env('RAZORPAY_WEBHOOK_SECRET')) {
    fail(
      'RAZORPAY_WEBHOOK_SECRET',
      'not set while payments are enabled. The webhook is the authoritative record of payment — without it, an order whose browser tab closed mid-payment is never marked paid'
    );
  } else {
    pass('RAZORPAY_WEBHOOK_SECRET');
  }
}

// --- Sign-in code delivery -------------------------------------------------
const resend = env('RESEND_API_KEY');
const emailFrom = env('EMAIL_FROM');

if (resend && !emailFrom) {
  fail('EMAIL_FROM', 'is required when RESEND_API_KEY is set, or no email can be sent');
} else if (resend && emailFrom) {
  pass('RESEND_API_KEY', 'email codes enabled');
} else {
  warn('RESEND_API_KEY', 'not set — the "email me a code" sign-in option is hidden');
}

const msg91Key = env('MSG91_AUTH_KEY');
const msg91Template = env('MSG91_OTP_TEMPLATE_ID');

if (msg91Key && !msg91Template) {
  fail(
    'MSG91_OTP_TEMPLATE_ID',
    'is required when MSG91_AUTH_KEY is set. Indian carriers drop SMS without a DLT-approved template'
  );
} else if (msg91Key && msg91Template) {
  pass('MSG91_AUTH_KEY', 'SMS codes enabled');
} else {
  warn('MSG91_AUTH_KEY', 'not set — the "use mobile number" sign-in option is hidden');
}

// --- Demo allowlist --------------------------------------------------------
const demo = env('DEMO_IDENTIFIERS')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

if (demo.length > 0) {
  const emailLive = Boolean(resend && emailFrom);
  const smsLive = Boolean(msg91Key && msg91Template);

  if (emailLive && smsLive) {
    warn(
      'DEMO_IDENTIFIERS',
      `is set with ${demo.length} identifier(s) but both channels are live, so it does nothing. Remove it`
    );
  } else if (PRODUCTION) {
    // Not a failure: showing codes to a named allowlist is the point of it.
    // But it must be a deliberate, visible choice on a public deployment.
    warn(
      'DEMO_IDENTIFIERS',
      `is set on production. Sign-in codes will be SHOWN ON SCREEN for these ${demo.length} identifier(s): ${demo.join(', ')}. Remove it once delivery is live`
    );
  } else {
    pass('DEMO_IDENTIFIERS', `${demo.length} demo identifier(s)`);
  }
}

// --- Error monitoring ------------------------------------------------------
if (PRODUCTION && !env('SENTRY_DSN') && !env('NEXT_PUBLIC_SENTRY_DSN')) {
  warn('SENTRY_DSN', 'not set — errors go to stdout only, with no alerting');
}

/* -------------------------------------------------------------------------- */
/* Output                                                                       */
/* -------------------------------------------------------------------------- */

const mode = PRODUCTION ? 'production' : 'local';
console.log(`\nEnvironment check (${mode})\n`);

if (ok.length) {
  console.log('  Ready');
  for (const line of ok) console.log(`    ✓ ${line}`);
  console.log('');
}

if (warnings.length) {
  console.log('  Warnings — the site runs, with reduced function');
  for (const line of warnings) console.log(`    ! ${line}`);
  console.log('');
}

if (problems.length) {
  console.log('  Problems — fix before deploying');
  for (const line of problems) console.log(`    ✗ ${line}`);
  console.log('');
  console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'} found.\n`);
  process.exit(1);
}

console.log(
  warnings.length
    ? `No blocking problems. ${warnings.length} warning${warnings.length === 1 ? '' : 's'} above.\n`
    : 'All checks passed.\n'
);
