import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // The token suite is node:test with zero dependencies on purpose
    // (docs/implementation-plan.md §0). It runs via `npm run test:tokens`, and
    // must not be collected here: vitest's default include would otherwise pick
    // up test/build-tokens.test.js and run it on a runner it was not written for.
    //
    // `*.db.test.ts` needs a reachable PostgreSQL, which the `verify` job does
    // not provide. Those files run explicitly in the CI `database` job, which
    // has a service container.
    exclude: [
      'node_modules/**',
      '.next/**',
      'test/build-tokens.test.js',
      '**/*.db.test.ts',
    ],
  },
});
