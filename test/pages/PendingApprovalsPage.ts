import { Locator, Page } from '@playwright/test';

/** Pending approvals (/approvals): the RM's proposals (New) and changes (Change). */
export class PendingApprovalsPage {
  /** The red panel after an approve that fails on capacity. */
  readonly capacityError: Locator;
  readonly dialog: Locator;

  constructor(private readonly page: Page) {
    this.capacityError = page.getByRole('alert').filter({ hasText: 'Not approved' });
    this.dialog = page.getByRole('dialog');
  }

  async goto(): Promise<void> {
    await this.page.goto('/approvals');
  }

  /** The row of one item, by the employee and the request title. */
  row(fullName: string, requestTitle: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name: fullName, exact: true }) })
      .filter({ has: this.page.getByRole('cell', { name: requestTitle, exact: true }) });
  }

  /** New or Change, the first column of the row. */
  type(fullName: string, requestTitle: string): Locator {
    return this.row(fullName, requestTitle).getByRole('cell').first();
  }

  /** Clicks Approve on the row, then Approve in the confirmation. */
  async approve(fullName: string, requestTitle: string): Promise<void> {
    await this.row(fullName, requestTitle).getByRole('button', { name: 'Approve' }).click();
    await this.dialog.getByRole('button', { name: 'Approve' }).click();
  }

  async openReject(fullName: string, requestTitle: string): Promise<void> {
    await this.row(fullName, requestTitle).getByRole('button', { name: 'Reject' }).click();
  }
}
