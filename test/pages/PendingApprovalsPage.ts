import { Locator, Page } from '@playwright/test';

/** Pending approvals (/approvals): the RM's proposals (New) and changes (Change). */
export class PendingApprovalsPage {
  /** The red panel after an approve that fails on capacity. */
  readonly capacityError: Locator;
  readonly dialog: Locator;
  /** The comment field of the Reject dialog. */
  readonly rejectComment: Locator;

  constructor(private readonly page: Page) {
    this.capacityError = page.getByRole('alert').filter({ hasText: 'Not approved' });
    this.dialog = page.getByRole('dialog');
    this.rejectComment = this.dialog.getByLabel('Comment');
  }

  async goto(): Promise<void> {
    await this.page.goto('/approvals');
  }

  /** The row of one item, by the employee and the request title (one cell holds both, and the proposer). */
  row(fullName: string, requestTitle: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(fullName, { exact: true }) })
      .filter({ hasText: ` · ${requestTitle}` });
  }

  /** New or Change, the first column of the row. */
  type(fullName: string, requestTitle: string): Locator {
    return this.row(fullName, requestTitle).getByRole('cell').first();
  }

  /** Clicks Approve on the row, then confirms (Approve, or Approve change for a change). */
  async approve(fullName: string, requestTitle: string): Promise<void> {
    await this.row(fullName, requestTitle).getByRole('button', { name: 'Approve' }).click();
    await this.dialog.getByRole('button', { name: /^Approve/ }).click();
  }

  async openReject(fullName: string, requestTitle: string): Promise<void> {
    await this.row(fullName, requestTitle).getByRole('button', { name: 'Reject' }).click();
  }

  /** Clicks Reject in the open Reject dialog. */
  async confirmReject(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Reject' }).click();
  }

  async cancelDialog(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  /** A validation message in the dialog, e.g. "Comment is required". */
  dialogError(text: string): Locator {
    return this.dialog.getByText(text, { exact: true });
  }
}
