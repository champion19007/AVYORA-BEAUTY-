#!/usr/bin/env node
/**
 * Development server for reviewing the redesign with no database.
 *
 * Sets NEXT_PUBLIC_REDESIGN=1 and defines DATABASE_URL as empty. Next.js
 * never overrides a variable that is already defined, so .env.local's
 * database (production) is not used: nothing in this review session can
 * read from or write to it. Pages that need the database show their
 * unavailable states.
 */
import { spawn } from 'node:child_process';

const env = { ...process.env, NEXT_PUBLIC_REDESIGN: '1', DATABASE_URL: '', DATABASE_REPLICA_URL: '' };
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '--turbopack', '-p', process.argv[2] ?? '9003'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
