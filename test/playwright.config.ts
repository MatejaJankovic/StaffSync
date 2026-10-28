import { defineConfig, devices } from '@playwright/test';
import { API_URL, APP_URL } from './fixtures/env';

// The UI and E2E tests: Chromium on the app, with a screenshot and a trace of each failure
const browser = {
  ...devices['Desktop Chrome'],
  baseURL: APP_URL,
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
} as const;

export default defineConfig({
  testDir: './tests',
  // One test at a time: the suites share one database, and the API tests book the seeded employees' capacity
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: API_URL },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: browser,
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      // The 8 demo steps run as one test, with a logout and login per role switch
      timeout: 120_000,
      use: browser,
    },
  ],
});
