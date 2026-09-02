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
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
