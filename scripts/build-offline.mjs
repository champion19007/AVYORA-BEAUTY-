#!/usr/bin/env node
/**
 * Production build with no database: `npm run build:offline`.
 *
 * Several public pages (home, collections, journal) read Postgres while they
 * are prerendered. With DATABASE_URL set but unreachable, the build fails, and
 * that is deliberate: a real deployment must not bake an outage into cached
 * pages (an empty journal, every product shown as sold out).
 *
 * For checking the build on a machine without a database (CI, a laptop), this
 * runs `next build` with DATABASE_URL explicitly empty. An empty value set
 * here overrides .env.local, and the app then renders its catalogue-only
 * fallbacks: no stock badges, catalogue prices, no journal articles. The
 * output is for verification only, never for deployment, so it refuses to run
 * on Vercel.
 */
import { spawnSync } from 'node:child_process';

if (process.env.VERCEL) {
  console.error('build:offline is for local and CI verification; Vercel builds use `npm run build`.');
  process.exit(1);
}

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32', // npx is a .cmd shim on Windows
  env: { ...process.env, DATABASE_URL: '' },
});
process.exit(result.status ?? 1);
