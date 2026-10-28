import { test as base } from '@playwright/test';
import { AuthApi } from '../api/AuthApi';

// The Playwright fixtures of the specs: import test and expect from here instead of @playwright/test.
export const test = base.extend<{ authApi: AuthApi }>({
  authApi: async ({ request }, use) => {
    await use(new AuthApi(request));
  },
});

export { expect } from '@playwright/test';
