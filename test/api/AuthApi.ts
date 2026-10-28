import { APIRequestContext, APIResponse, expect } from '@playwright/test';

/** Client for /api/auth: login, the current user and change password. */
export class AuthApi {
  constructor(private readonly request: APIRequestContext) {}

  login(email: string, password: string): Promise<APIResponse> {
    return this.request.post('/api/auth/login', { data: { email, password } });
  }

  /** Sends the body exactly as given, for malformed JSON. */
  loginWithRawBody(body: string): Promise<APIResponse> {
    return this.request.post('/api/auth/login', {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Logs in and returns the JWT and the user. Fails the test if the login fails. */
  async loginAs(email: string, password: string): Promise<{ token: string; user: { id: number } }> {
    const response = await this.login(email, password);
    expect(response.status(), `login as ${email}`).toBe(200);
    return response.json();
  }

  /** Logs in and returns the JWT. Fails the test if the login fails. */
  async tokenFor(email: string, password: string): Promise<string> {
    return (await this.loginAs(email, password)).token;
  }

  me(token?: string): Promise<APIResponse> {
    return this.request.get('/api/auth/me', { headers: bearer(token) });
  }

  changePassword(token: string, oldPassword: string, newPassword: string): Promise<APIResponse> {
    return this.request.put('/api/auth/password', {
      data: { oldPassword, newPassword },
      headers: bearer(token),
    });
  }
}

export function bearer(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
