import { expect, test } from '../../fixtures/ui';
import { fullName, Persona, users } from '../../fixtures/users';
import { CandidatesPage } from '../../pages/CandidatesPage';
import { PendingApprovalsPage } from '../../pages/PendingApprovalsPage';
import { ProjectDetailsPage } from '../../pages/ProjectDetailsPage';
import { ProjectsPage } from '../../pages/ProjectsPage';
import { RequestFormPage } from '../../pages/RequestFormPage';
import { Shell } from '../../pages/Shell';

// TC_E2E_001 in docs/TEST_CASES.md §5: the §4 demo scenario across roles, through the UI.
// Needs a freshly reset database (docker compose down -v && docker compose up --build): Marko must be free
// and Jelena 60% busy until Nov 14, as in the demo seed.
const REQUEST = 'Java Developer';
const MARKO = fullName(users.marko);
const JELENA = fullName(users.jelena);

test('TC_E2E_001 the §4 demo flow across roles', async ({ page, loginAs }) => {
  test.setTimeout(120_000);
  const shell = new Shell(page);
  const details = new ProjectDetailsPage(page);
  const candidates = new CandidatesPage(page);
  const approvals = new PendingApprovalsPage(page);
  const projectName = `Project Alpha ${Date.now()}`;
  let projectId = 0;
  let current: Persona | undefined;

  const switchTo = async (persona: Persona) => {
    if (current) await shell.logout(current);
    await loginAs(persona);
    current = persona;
  };

  await test.step('1. Ana creates Project Alpha (Nov 1 – Mar 31)', async () => {
    await switchTo(users.ana);
    const projects = new ProjectsPage(page);
    await projects.goto();
    await projects.createProject({ name: projectName, client: 'Vega Retail', startDate: '01/11/2026', endDate: '31/03/2027' });

    await expect(projects.row(projectName)).toContainText('Planned');
    await projects.open(projectName);
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    projectId = Number(page.url().split('/').pop());
  });

  await test.step('2. Ana creates the Java Developer request', async () => {
    await details.newRequestLink.click();
    const form = new RequestFormPage(page);
    await form.fill({
      title: REQUEST,
      seniority: 'Medior',
      allocation: '60%',
      headcount: 2,
      startDate: '01/11/2026',
      endDate: '31/01/2027',
      skills: [
        { name: 'Java', minLevel: 4, required: true },
        { name: 'Spring', minLevel: 3, required: true },
        { name: 'PostgreSQL', minLevel: 2, required: false },
      ],
    });
    await form.saveButton.click();

    await expect(details.requestRow(REQUEST)).toContainText('Open');
  });

  await test.step('3. The candidates show Marko 85 above Jelena 67, with her capacity warning', async () => {
    await details.findCandidates(REQUEST);

    await expect(candidates.rows.nth(0)).toContainText(MARKO);
    await expect(candidates.rows.nth(0)).toContainText(/85\s*\/100/);
    await expect(candidates.rows.nth(1)).toContainText(JELENA);
    await expect(candidates.rows.nth(1)).toContainText(/67\s*\/100/);
    await expect(candidates.warnings(JELENA)).toContainText([
      'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)',
    ]);
  });

  await test.step('4. Ana proposes Marko', async () => {
    await candidates.propose(MARKO);
    await details.goto(projectId);

    await expect(details.teamRow(MARKO)).toContainText('Proposed');
  });

  await test.step('5. Igor approves Marko, and the request is partially filled', async () => {
    await switchTo(users.igor);
    await approvals.goto();
    await expect(approvals.type(MARKO, REQUEST)).toHaveText('New');
    await approvals.approve(MARKO, REQUEST);
    await expect(approvals.row(MARKO, REQUEST)).toBeHidden();

    await switchTo(users.ana);
    await details.goto(projectId);
    await expect(details.teamRow(MARKO)).toContainText('Approved');
    await expect(details.requestRow(REQUEST)).toContainText('Partially filled');
  });

  await test.step('6. Ana proposes Jelena for the whole period, and Igor gets the capacity error', async () => {
    await details.findCandidates(REQUEST);
    await candidates.propose(JELENA);
    await expect(shell.toast(`${JELENA} was proposed, with warnings`)).toBeVisible();

    await switchTo(users.igor);
    await approvals.goto();
    await approvals.approve(JELENA, REQUEST);

    await expect(approvals.capacityError).toContainText(`Not approved: ${JELENA} would be over capacity on 10 working days`);
    await expect(approvals.capacityError).toContainText('2 Nov 2026 – 13 Nov 2026');
    await expect(approvals.capacityError).toContainText('60% existing + 60% new = 120%');
    await expect(approvals.row(JELENA, REQUEST)).toBeVisible();
  });

  await test.step('7. Ana re-proposes Jelena for Nov 15 – Jan 31, Igor approves, and the request is filled', async () => {
    await switchTo(users.ana);
    await details.goto(projectId);
    await details.withdraw(JELENA, REQUEST);
    await expect(details.teamRow(JELENA)).toContainText('Cancelled');
    await details.findCandidates(REQUEST);
    await candidates.propose(JELENA, { startDate: '15/11/2026', endDate: '31/01/2027' });

    await switchTo(users.igor);
    await approvals.goto();
    await approvals.approve(JELENA, REQUEST);
    await expect(approvals.row(JELENA, REQUEST)).toBeHidden();

    await switchTo(users.ana);
    await details.goto(projectId);
    // Jelena has two rows by now: the withdrawn proposal and the approved one
    await expect(details.teamRow(JELENA).filter({ hasText: 'Approved' })).toBeVisible();
    await expect(details.requestRow(REQUEST)).toContainText('Filled');
    await expect(details.requestRow(REQUEST)).not.toContainText('Partially');
  });

  await test.step('8. Ana requests 60% → 80% for Marko, and Igor approves the change', async () => {
    await details.requestChange(MARKO, REQUEST, '80%', 'The client asked for more work on the reporting module');
    await expect(details.teamRow(MARKO)).toContainText('Change pending');

    await switchTo(users.igor);
    await approvals.goto();
    await expect(approvals.type(MARKO, REQUEST)).toHaveText('Change');
    await expect(approvals.row(MARKO, REQUEST)).toContainText(/60%.*80%/);
    await approvals.approve(MARKO, REQUEST);
    await expect(approvals.row(MARKO, REQUEST)).toBeHidden();

    await switchTo(users.ana);
    await details.goto(projectId);
    await expect(details.teamRow(MARKO)).toContainText('80%');
    await expect(details.teamRow(MARKO)).toContainText('Approved');
  });
});
