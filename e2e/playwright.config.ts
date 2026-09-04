import { defineConfig } from '@playwright/test';

// The OAuth specs watch the extension's service worker call /oauth2/revoke; Playwright reports service worker requests
// only behind this flag.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: './specs',
  globalSetup: './setup/globalSetup.ts',
  globalTeardown: './setup/globalTeardown.ts',
  outputDir: 'test-results',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Every test gets its own browser profile, but they all share one Tolgee server and one seeded user.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    trace: 'retain-on-failure',
  },
});
