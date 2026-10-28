import { expect, test } from '../../fixtures/ui';
import { fullName, users } from '../../fixtures/users';
import { CandidatesPage } from '../../pages/CandidatesPage';

// Test cases TC_UI_CAND_001 – 002 in docs/TEST_CASES.md §4. Nothing is proposed, so no capacity is booked.
const JELENA_CAPACITY = 'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)';

let candidatesPage: CandidatesPage;

test.beforeEach(async ({ page, loginAs, createJavaRequest }) => {
  const { requestId } = await createJavaRequest();
  await loginAs(users.ana);
  candidatesPage = new CandidatesPage(page);
  await candidatesPage.goto(requestId);
});

// Marko's 85 depends on him being free, which the API tests change, so who is first is checked by the E2E test
test('TC_UI_CAND_001 candidates are ranked with their score, reasons and warnings', async () => {
  await expect(candidatesPage.rows.first()).toBeVisible();
  const scores = (await candidatesPage.scores.allInnerTexts()).map((text) => Number.parseInt(text, 10));
  expect(scores.length).toBeGreaterThan(1);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));

  const jelena = candidatesPage.row(fullName(users.jelena));
  await expect(jelena).toContainText(/67\s*\/100/);
  await expect(jelena.getByRole('list', { name: 'Reasons' })).toContainText('Java 4/5 (required ≥ 4)');
  await expect(candidatesPage.warnings(fullName(users.jelena))).toContainText([JELENA_CAPACITY]);
});

test('TC_UI_CAND_002 the propose dialog is pre-filled and shows the warning', async () => {
  await candidatesPage.openPropose(fullName(users.jelena));
  const dialog = candidatesPage.proposeDialog;

  await expect(dialog).toHaveAccessibleName(`Propose ${fullName(users.jelena)}`);
  await expect(dialog.getByRole('combobox', { name: 'Allocation' })).toContainText('60%');
  await expect(dialog.getByLabel('Start date')).toHaveValue('01/11/2026');
  await expect(dialog.getByLabel('End date')).toHaveValue('31/01/2027');
  await expect(dialog.getByRole('list', { name: 'Warnings' })).toContainText(JELENA_CAPACITY);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
