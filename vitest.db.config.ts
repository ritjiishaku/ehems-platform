import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Database-backed tests.
 *
 * `test:app` must stay runnable with no PostgreSQL, so `vitest.config.ts`
 * excludes `*.db.test.ts`. This config opts them back in and runs them against
 * the same database the CI `database` job has already migrated and seeded.
 *
 * Two deliberate differences from `vitest.config.ts`:
 *
 *  - It does not use `mergeConfig`. Vitest concatenates array options when
 *    merging, so an `include` override would have been appended to the base
 *    list rather than replacing it, and this file would have run the whole
 *    unit suite a second time.
 *  - `environment: 'node'`, with no jsdom and no `test/setup.ts`. These tests
 *    talk to Postgres; there is nothing to render.
 *
 * They run through vitest rather than ts-node because `lib/ndpa/` imports
 * through the `@/` alias, which a bare ts-node invocation cannot resolve.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.db.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Real transactions and a Postgres handshake; the 5s default is tight on a
    // cold CI runner.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential: every file here shares one database, so parallel workers
    // would interleave against the same rows.
    fileParallelism: false,
  },
});
