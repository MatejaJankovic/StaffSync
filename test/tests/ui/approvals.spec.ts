import { AllocationsApi } from '../../api/AllocationsApi';
import { AuthApi } from '../../api/AuthApi';
import { expect, test } from '../../fixtures/ui';
import { fullName, PASSWORD, users } from '../../fixtures/users';
import { PendingApprovalsPage } from '../../pages/PendingApprovalsPage';

// Test cases TC_UI_APPR_001 – 003 in docs/TEST_CASES.md §4.
// Nothing gets approved here, and createJavaRequest cancels its project after each test, which withdraws the
// proposal, so no capacity is booked.
let approvalsPage: PendingApprovalsPage;

test.beforeEach(({ page }) => {
  approvalsPage = new PendingApprovalsPage(page);
});

test('TC_UI_APPR_001 pending approvals mark New and Change items', async ({ loginAs }) => {
  // From the seed: Maja's team has Teodora's proposal and Uros's pending change (end Dec 31 → Jan 29)
  await loginAs(users.maja);
  await approvalsPage.goto();

  await expect(approvalsPage.type('Teodora Ilic', 'Angular Developer')).toHaveText('New');
  await expect(approvalsPage.type('Uros Zivkovic', 'Frontend Developer (React)')).toHaveText('Change');
  await expect(approvalsPage.row('Uros Zivkovic', 'Frontend Developer (React)')).toContainText(
    /1 Oct 2026 – 31 Dec 2026.*changes to 1 Oct 2026 – 29 Jan 2027/,
  );
});

test.describe('with Jelena proposed for the whole period', () => {
  let requestTitle: string;

  test.beforeEach(async ({ api, anaToken, createJavaRequest, loginAs }) => {
    const request = await createJavaRequest();
    requestTitle = request.requestTitle;
    const jelenaId = (await new AuthApi(api).loginAs(users.jelena.email, PASSWORD)).user.id;
    const allocations = new AllocationsApi(api, anaToken);
    const response = await allocations.propose({ requestId: request.requestId, employeeId: jelenaId });
    expect(response.status()).toBe(201);

    await loginAs(users.igor);
    await approvalsPage.goto();
  });

  test('TC_UI_APPR_002 the capacity error is shown on approve', async () => {
    await approvalsPage.approve(fullName(users.jelena), requestTitle);

    await expect(approvalsPage.capacityError).toContainText(
      'Not approved: Jelena Petrovic would be over capacity on 10 working days',
    );
    await expect(approvalsPage.capacityError).toContainText('2 Nov 2026 – 13 Nov 2026');
    await expect(approvalsPage.capacityError).toContainText('60% existing + 60% new = 120%');
    await expect(approvalsPage.row(fullName(users.jelena), requestTitle)).toBeVisible();
  });

  test('TC_UI_APPR_003 reject needs a comment of at least 10 characters', async () => {
    await approvalsPage.openReject(fullName(users.jelena), requestTitle);

    await approvalsPage.rejectComment.fill('Too busy');
    await approvalsPage.rejectComment.blur();
    await approvalsPage.confirmReject();

    await expect(approvalsPage.dialogError('Comment must be at least 10 characters')).toBeVisible();
    await expect(approvalsPage.dialog).toBeVisible();
    await approvalsPage.cancelDialog();
    await expect(approvalsPage.row(fullName(users.jelena), requestTitle)).toBeVisible();
  });
});
