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
    exclude: ['node_modules/**', '.next/**', 'test/build-tokens.test.js'],
  },
});
