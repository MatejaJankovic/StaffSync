import { expect, test } from '../../fixtures/ui';
import { users } from '../../fixtures/users';
import { Shell } from '../../pages/Shell';

// Test cases TC_UI_NAV_001 – 004 in docs/TEST_CASES.md §3: the menu per role and the route guards
const MENU = [
  { persona: users.ana, links: ['Home', 'My projects', 'Employee search'] },
  { persona: users.igor, links: ['Home', 'Pending approvals', 'My team', 'Employee search'] },
  { persona: users.marko, links: ['Home', 'My profile', 'My allocations'] },
  { persona: users.vukasin, links: ['Home', 'Users', 'Departments', 'Skills catalog'] },
];

for (const { persona, links } of MENU) {
  test(`TC_UI_NAV_001 ${persona.role} sees only their menu`, async ({ page, loginAs }) => {
    await loginAs(persona);

    const shell = new Shell(page);
    await expect(shell.menuLinks).toHaveCount(links.length);
    for (const link of links) {
      await expect(shell.menuLink(link)).toBeVisible();
    }
  });
}

test('TC_UI_NAV_002 a protected page without logging in redirects to login', async ({ page }) => {
  await page.goto('/projects');

  await expect(page).toHaveURL(/\/login$/);
});

test('TC_UI_NAV_003 a page of another role redirects to Home', async ({ page, loginAs }) => {
  await loginAs(users.ana);

  await page.goto('/admin/users');

  await expect(page).toHaveURL(/\/home$/);
});

test('TC_UI_NAV_004 logout, and Back does not open the app again', async ({ page, loginAs }) => {
  await loginAs(users.ana);
  await page.goto('/projects');

  await new Shell(page).logout(users.ana);
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();

  await expect(page).toHaveURL(/\/login$/);
});
