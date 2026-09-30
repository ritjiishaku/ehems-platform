import { defineConfig, devices } from '@playwright/test';

/**
 * 375px is the primary target, not an afterthought: the audience is on mid-range
 * Android over 3G (.agents/rules/design-system.md §Principles). It is therefore
 * the first project, and the desktop run is the cross-browser check from PRD
 * Appendix E rather than the default.
 */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalTeardown: './test/e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    // Always a production build, in CI and locally alike.
    //
    // Two reasons. `next start` needs a build, and without it a stale `.next`
    // silently tests yesterday's page. More importantly, dev serves unminified
    // bundles plus the HMR client, which measured ~852 KB against ~188 KB for
    // the real build - a bandwidth assertion run against dev is not a bandwidth
    // assertion at all.
    command: 'npm run build && npm run start',
    url: 'http://127.0.0.1:3000',
    // Never reuse an already-listening server. A `next start` left over from a
    // previous run has the *old* build loaded in memory, so reusing it tests
    // stale code while `.next` on disk looks freshly built — a gate that reports
    // green on a build that was never served. Always rebuild and start clean.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'mobile-375',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
