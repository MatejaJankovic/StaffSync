import { expect, test } from '../../fixtures/ui';
import { PASSWORD, users } from '../../fixtures/users';
import { LoginPage } from '../../pages/LoginPage';
import { Shell } from '../../pages/Shell';

// Test cases TC_UI_LOGIN_001 – 009 in docs/TEST_CASES.md §3: what the login page shows
const INVALID_CREDENTIALS = 'Invalid email or password.';

let loginPage: LoginPage;

test.beforeEach(async ({ page }) => {
  loginPage = new LoginPage(page);
  await loginPage.goto();
});

test('TC_UI_LOGIN_001 valid credentials open Home with the role menu', async ({ page }) => {
  await loginPage.signIn(users.ana.email, PASSWORD);

  await expect(page).toHaveURL(/\/home$/);
  await expect(new Shell(page).menuLink('My projects')).toBeVisible();
});

test('TC_UI_LOGIN_002 wrong password shows the error and stays on login', async ({ page }) => {
  await loginPage.signIn(users.ana.email, 'WrongPass1!');

  await expect(loginPage.error).toContainText(INVALID_CREDENTIALS);
  await expect(page).toHaveURL(/\/login$/);
});

test('TC_UI_LOGIN_003 unknown email shows the same error as a wrong password', async () => {
  await loginPage.signIn('nobody@staffsync.local', PASSWORD);

  await expect(loginPage.error).toContainText(INVALID_CREDENTIALS);
});

test('TC_UI_LOGIN_004 empty fields show both messages and send no request', async ({ page }) => {
  const loginRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/login')) loginRequests.push(request.url());
  });

  await loginPage.signInButton.click();

  await expect(loginPage.fieldError('Email is required')).toBeVisible();
  await expect(loginPage.fieldError('Password is required')).toBeVisible();
  expect(loginRequests).toEqual([]);
});

test('TC_UI_LOGIN_005 invalid email format', async () => {
  await loginPage.email.fill('ana_pm');
  await loginPage.email.blur();

  await expect(loginPage.fieldError('Enter a valid email address')).toBeVisible();
});

test('TC_UI_LOGIN_006 password is masked and can be shown', async () => {
  await loginPage.password.fill(PASSWORD);
  await expect(loginPage.password).toHaveAttribute('type', 'password');

  await loginPage.showPasswordButton.click();
  await expect(loginPage.password).toHaveAttribute('type', 'text');

  await loginPage.hidePasswordButton.click();
  await expect(loginPage.password).toHaveAttribute('type', 'password');
});

test('TC_UI_LOGIN_007 Enter in the password field signs in', async ({ page }) => {
  await loginPage.fill(users.ana.email, PASSWORD);
  await loginPage.password.press('Enter');

  await expect(page).toHaveURL(/\/home$/);
});

test('TC_UI_LOGIN_008 correcting the password after an error signs in', async ({ page }) => {
  await loginPage.signIn(users.ana.email, 'WrongPass1!');
  await expect(loginPage.error).toBeVisible();

  await loginPage.password.fill(PASSWORD);
  await loginPage.signInButton.click();

  await expect(page).toHaveURL(/\/home$/);
});

test('TC_UI_LOGIN_009 email with spaces around it and in upper case signs in', async ({ page }) => {
  await loginPage.signIn(`  ${users.ana.email.toUpperCase()}  `, PASSWORD);

  await expect(page).toHaveURL(/\/home$/);
});
