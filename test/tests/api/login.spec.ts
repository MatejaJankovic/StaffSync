import { UsersApi } from '../../api/UsersApi';
import { expectError, fieldsOf } from '../../api/errors';
import { expect, test } from '../../fixtures/test';
import { PASSWORD, users } from '../../fixtures/users';

// Test cases TC_API_AUTH_001 – 012 in docs/TEST_CASES.md §1: POST /api/auth/login
const INVALID_CREDENTIALS = 'Invalid email or password';
const WRONG_PASSWORD = 'WrongPass1!';
const UNKNOWN_EMAIL = 'nobody@staffsync.local';
const SQL_INJECTION = "' OR '1'='1' --";

test.describe('valid login', () => {
  test('TC_API_AUTH_001 returns a token and the user, without the password', async ({ authApi }) => {
    const response = await authApi.login(users.ana.email, PASSWORD);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.user).toMatchObject({ email: users.ana.email, firstName: users.ana.firstName, role: users.ana.role });
    const text = JSON.stringify(body);
    expect(text).not.toContain(PASSWORD);
    // No password field and no BCrypt hash (mustChangePassword is only a flag)
    expect(text).not.toMatch(/"password(Hash)?"|\$2[aby]\$/i);
  });

  test('TC_API_AUTH_008 matches the email ignoring case', async ({ authApi }) => {
    const response = await authApi.login(users.ana.email.toUpperCase(), PASSWORD);

    expect(response.status()).toBe(200);
    expect((await response.json()).user.email).toBe(users.ana.email);
  });
});

test.describe('wrong credentials get the same 401, so the email is not revealed', () => {
  test('TC_API_AUTH_002 valid email, wrong password', async ({ authApi }) => {
    const error = await expectError(await authApi.login(users.ana.email, WRONG_PASSWORD), 401, 'UNAUTHORIZED');

    expect(error.message).toBe(INVALID_CREDENTIALS);
  });

  test('TC_API_AUTH_003 unknown email gets exactly the same body as a wrong password', async ({ authApi }) => {
    const wrongPassword = await expectError(await authApi.login(users.ana.email, WRONG_PASSWORD), 401, 'UNAUTHORIZED');
    const unknownEmail = await expectError(await authApi.login(UNKNOWN_EMAIL, PASSWORD), 401, 'UNAUTHORIZED');

    expect({ ...unknownEmail, timestamp: undefined }).toEqual({ ...wrongPassword, timestamp: undefined });
  });

  test('TC_API_AUTH_004 unknown email and wrong password', async ({ authApi }) => {
    const error = await expectError(await authApi.login(UNKNOWN_EMAIL, WRONG_PASSWORD), 401, 'UNAUTHORIZED');

    expect(error.message).toBe(INVALID_CREDENTIALS);
  });

  test('TC_API_AUTH_005 inactive user', async ({ authApi, request }) => {
    const usersApi = new UsersApi(request, await authApi.tokenFor(users.vukasin.email, PASSWORD));
    const email = `inactive.${Date.now()}@staffsync.local`;
    const created = await usersApi.create({
      email,
      firstName: 'Inactive',
      lastName: 'User',
      role: 'PM',
      departmentId: 1, // Engineering, from the seed: a PM needs a department
      capacityPercent: 100,
      temporaryPassword: PASSWORD,
    });
    expect(created.status()).toBe(201);
    expect((await usersApi.deactivate((await created.json()).id)).status()).toBe(200);

    const error = await expectError(await authApi.login(email, PASSWORD), 401, 'UNAUTHORIZED');

    expect(error.message).toBe(INVALID_CREDENTIALS);
  });

  test('TC_API_AUTH_009 password in the wrong case', async ({ authApi }) => {
    const error = await expectError(await authApi.login(users.ana.email, PASSWORD.toUpperCase()), 401, 'UNAUTHORIZED');

    expect(error.message).toBe(INVALID_CREDENTIALS);
  });
});

test.describe('validation', () => {
  test('TC_API_AUTH_006 empty email and password', async ({ authApi }) => {
    const error = await expectError(await authApi.login('', ''), 400, 'VALIDATION_ERROR');

    expect(fieldsOf(error)).toEqual(['email', 'password']);
  });

  test('TC_API_AUTH_007 invalid email format', async ({ authApi }) => {
    const error = await expectError(await authApi.login('ana_pm', PASSWORD), 400, 'VALIDATION_ERROR');

    expect(fieldsOf(error)).toEqual(['email']);
  });

  test('TC_API_AUTH_012 malformed JSON gets 400 without a stack trace', async ({ authApi }) => {
    const response = await authApi.loginWithRawBody('{ "email": ');

    await expectError(response, 400, 'BAD_REQUEST');
    expect(await response.text()).not.toMatch(/Exception|at com\.|at org\./);
  });
});

test.describe('SQL injection', () => {
  test('TC_API_AUTH_010 in the email is rejected, never logged in', async ({ authApi }) => {
    const response = await authApi.login(SQL_INJECTION, 'x');

    expect([400, 401]).toContain(response.status());
    await expectError(response, response.status(), response.status() === 400 ? 'VALIDATION_ERROR' : 'UNAUTHORIZED');
  });

  test('TC_API_AUTH_011 in the password gets the normal 401', async ({ authApi }) => {
    const error = await expectError(await authApi.login(users.ana.email, SQL_INJECTION), 401, 'UNAUTHORIZED');

    expect(error.message).toBe(INVALID_CREDENTIALS);
  });
});
