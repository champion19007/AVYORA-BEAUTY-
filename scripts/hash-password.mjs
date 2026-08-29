#!/usr/bin/env node
/**
 * Generates the values for ADMIN_PASSWORD_HASH and SESSION_SECRET.
 *
 *   node scripts/hash-password.mjs 'your-admin-password'
 *
 * The password itself is never stored anywhere — only the PBKDF2 hash, which
 * cannot be reversed back into the password.
 */
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 210_000;

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs 'your-admin-password'");
  process.exit(1);
}

if (password.length < 12) {
  console.error('Refusing: use a password of at least 12 characters for an admin account.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
  'deriveBits',
]);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  key,
  256
);

const sessionSecret = toBase64Url(crypto.getRandomValues(new Uint8Array(48)));

console.log('\nAdd these to your environment (Vercel: Project Settings -> Environment Variables).');
console.log('Never commit them.\n');
console.log(`ADMIN_USERNAME=admin`);
console.log(`ADMIN_PASSWORD_HASH=pbkdf2:${ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(new Uint8Array(bits))}`);
console.log(`SESSION_SECRET=${sessionSecret}\n`);
