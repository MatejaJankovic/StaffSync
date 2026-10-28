import { expect, test } from '../../fixtures/ui';
import { users } from '../../fixtures/users';
import { ProjectsPage } from '../../pages/ProjectsPage';
import { Shell } from '../../pages/Shell';

// Test cases TC_UI_PROJ_001 and TC_UI_PROJ_002 in docs/TEST_CASES.md §4
test.beforeEach(async ({ loginAs }) => {
  await loginAs(users.ana);
});

test('TC_UI_PROJ_001 create a project', async ({ page }) => {
  const projectsPage = new ProjectsPage(page);
  const name = `QA Project ${Date.now()}`;
  await projectsPage.goto();

  await projectsPage.createProject({ name, client: 'QA', startDate: '01/11/2026', endDate: '31/03/2027' });

  await expect(new Shell(page).toast('Project created')).toBeVisible();
  await expect(projectsPage.row(name)).toContainText('1 Nov 2026 – 31 Mar 2027');
  await expect(projectsPage.row(name)).toContainText('Planned');
});

test('TC_UI_PROJ_002 the project form shows its errors and does not save', async ({ page }) => {
  const projectsPage = new ProjectsPage(page);
  await projectsPage.goto();

  await projectsPage.fillNewProject({ client: 'QA', startDate: '31/03/2027', endDate: '01/11/2026' });
  await projectsPage.saveButton.click();

  await expect(projectsPage.dialogError('Name is required')).toBeVisible();
  await expect(projectsPage.dateRangeError).toHaveText('Start date must not be after end date');
  await expect(projectsPage.dialog).toBeVisible();
});
