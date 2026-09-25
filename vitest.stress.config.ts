import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Concurrency stress tests against a real Postgres.
 *
 * Separate from the normal suite on purpose. The normal suite uses PGlite,
 * which has one connection, so it can check that interleavings end in the
 * right state but cannot make two transactions actually contend for a row.
 * These can, and they truncate tables to do it, so they run only when
 * pointed at a scratch database explicitly:
 *
 *   STRESS_DATABASE_URL=postgres://…scratch…
 *   STRESS_ALLOW_DESTRUCTIVE=yes-this-is-a-scratch-database
 *   npx vitest run --config vitest.stress.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/stress/**/*.stress.ts'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
