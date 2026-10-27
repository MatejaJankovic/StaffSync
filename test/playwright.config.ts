import { defineConfig } from '@playwright/test';

// The backend of the full stack (docker compose up --build). Override with API_URL=... if needed.
const apiUrl = process.env.API_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: apiUrl },
    },
  ],
});
