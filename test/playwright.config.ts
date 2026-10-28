import { defineConfig, devices } from '@playwright/test';
import { API_URL, APP_URL } from './fixtures/env';

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
      use: {
        ...devices['Desktop Chrome'],
        baseURL: APP_URL,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: APP_URL,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
      },
    },
  ],
});
