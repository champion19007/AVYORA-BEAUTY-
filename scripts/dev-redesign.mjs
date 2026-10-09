#!/usr/bin/env node
/**
 * Development server for reviewing the redesign with no database.
 *
 * Sets NEXT_PUBLIC_REDESIGN=1 and NEXT_PUBLIC_FACE_SCAN=1 (browser-only
 * photo checks; hosted upload stays off), and defines DATABASE_URL as empty. Next.js
 * never overrides a variable that is already defined, so .env.local's
 * database is not used: nothing in this review session can
 * read from or write to it. Pages that need the database show their
 * unavailable states.
 */
import { spawn } from 'node:child_process';

const env = { ...process.env, NEXT_PUBLIC_REDESIGN: '1', NEXT_PUBLIC_FACE_SCAN: '1', FACE_SCAN_HOSTED: '', DATABASE_URL: '', DATABASE_REPLICA_URL: '' };
// `--start` serves an existing production build (npm run build:offline) instead of the dev server.
const start = process.argv.includes('--start');
const port = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? (start ? '9004' : '9003');
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', start ? ['next', 'start', '-p', port] : ['next', 'dev', '--turbopack', '-p', port], { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
