import { Locator, Page } from '@playwright/test';

/** The login screen (/login). */
export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly showPasswordButton: Locator;
  readonly hidePasswordButton: Locator;
  /** The error above the form after a failed login. */
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password', { exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.showPasswordButton = page.getByRole('button', { name: 'Show password' });
    this.hidePasswordButton = page.getByRole('button', { name: 'Hide password' });
    this.error = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async fill(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.fill(email, password);
    await this.signInButton.click();
  }

  /** A validation message under a field, e.g. "Email is required". */
  fieldError(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
