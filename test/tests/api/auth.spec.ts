import { UsersApi } from '../../api/UsersApi';
import { expectError } from '../../api/errors';
import { expect, test } from '../../fixtures/test';
import { PASSWORD, users } from '../../fixtures/users';

// Test cases TC_API_AUTH_013 – 017 in docs/TEST_CASES.md §1: the token, roles and change password

test.describe('token', () => {
  test('TC_API_AUTH_013 current user with a valid token', async ({ authApi }) => {
    const token = await authApi.tokenFor(users.ana.email, PASSWORD);

    const response = await authApi.me(token);

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ email: users.ana.email, firstName: users.ana.firstName, role: 'PM' });
  });

  test('TC_API_AUTH_014 protected endpoint without a token', async ({ authApi }) => {
    await expectError(await authApi.me(), 401, 'UNAUTHORIZED');
  });

  test('TC_API_AUTH_015 protected endpoint with an invalid token', async ({ authApi }) => {
    await expectError(await authApi.me('abc.def.ghi'), 401, 'UNAUTHORIZED');
  });

  test('TC_API_AUTH_015 token whose payload was changed to ADMIN', async ({ authApi }) => {
    const [header, payload, signature] = (await authApi.tokenFor(users.marko.email, PASSWORD)).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'ADMIN' })).toString('base64url');

    await expectError(await authApi.me(`${header}.${forged}.${signature}`), 401, 'UNAUTHORIZED');
  });
});

test.describe('roles', () => {
  test('TC_API_AUTH_016 employee calls an ADMIN and RM endpoint', async ({ authApi, request }) => {
    const usersApi = new UsersApi(request, await authApi.tokenFor(users.marko.email, PASSWORD));

    await expectError(await usersApi.list(), 403, 'FORBIDDEN');
  });
});

test.describe('change password', () => {
  test('TC_API_AUTH_017 wrong current password', async ({ authApi }) => {
    const token = await authApi.tokenFor(users.marko.email, PASSWORD);

    const error = await expectError(await authApi.changePassword(token, 'WrongPass1!', 'NewPassword1!'), 400, 'WRONG_PASSWORD');

    expect(error.message).toBe('Current password is incorrect');
    expect((await authApi.login(users.marko.email, PASSWORD)).status()).toBe(200);
  });
});
