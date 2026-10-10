import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * The integration tests boot PGlite — Postgres compiled to WebAssembly —
     * inside `beforeAll`. Instantiating that module takes a few seconds on an
     * idle machine and comfortably past Vitest's 10s default when the machine
     * is busy, which made three suites fail with "Hook timed out" while every
     * assertion in them still passed.
     *
     * A flaky suite is worse than a slow one: it teaches people to re-run
     * until green, and a real failure then looks like more noise. The tests
     * themselves keep the default timeout, so a genuinely hanging query still
     * fails fast; only the WASM startup is given room.
     */
    hookTimeout: 60_000,
    /**
     * Bounded, because every integration file boots its own PGlite instance.
     * The default (one worker per CPU, minus one) started seven at once on an
     * 8-core, 16 GB machine, and on a busy run two workers died with V8's
     * "Fatal process out of memory: Zone", losing their files' tests. Four
     * workers finished in the same wall-clock time (about 46s) without it.
     */
    maxWorkers: 4,
    /**
     * `npm run test:coverage`. Measures the logic that can break money,
     * stock and sign-in: lib, modules, infrastructure, server actions and API
     * routes. React components are left out; they render data this logic
     * produces and are checked in the browser. CI fails if coverage drops
     * below the thresholds, which sit just under what the suite reaches today.
     */
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.ts',
        'src/modules/**/*.ts',
        'src/infrastructure/**/*.ts',
        'src/app/**/actions.ts',
        'src/app/api/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/*.test.ts', 'src/test/**'],
      reporter: ['text-summary', 'json-summary'],
      // Measured 10 Oct 2026: statements 69.6, branches 60.6, functions 74.5, lines 72.1.
      // Raise these as tests are added; never lower them to make a change pass.
      thresholds: { statements: 68, branches: 58, functions: 72, lines: 70 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
