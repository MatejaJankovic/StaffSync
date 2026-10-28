import { Locator, Page } from '@playwright/test';
import { fullName, Persona } from '../fixtures/users';

/** The layout around every page after login: the main menu, the user menu and the toasts. */
export class Shell {
  readonly menu: Locator;
  readonly menuLinks: Locator;

  constructor(private readonly page: Page) {
    this.menu = page.getByRole('navigation', { name: 'Main menu' });
    this.menuLinks = this.menu.getByRole('link');
  }

  menuLink(label: string): Locator {
    return this.menu.getByRole('link', { name: label, exact: true });
  }

  /** A short confirmation such as "Project created". */
  toast(text: string): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }

  async logout(user: Persona): Promise<void> {
    await this.page.getByRole('button', { name: fullName(user) }).click();
    await this.page.getByRole('menuitem', { name: 'Logout' }).click();
  }
}
