import { Locator, Page } from '@playwright/test';

/** Candidates for a staffing request (/requests/{id}/candidates) and the Propose dialog. */
export class CandidatesPage {
  /** The candidate rows, best match first (the header row left out). */
  readonly rows: Locator;
  /** The score cell of each row, e.g. "85 /100", in the order shown. */
  readonly scores: Locator;
  readonly proposeDialog: Locator;
  readonly proposeAllocation: Locator;
  /** DD/MM/YYYY */
  readonly proposeStartDate: Locator;
  readonly proposeEndDate: Locator;
  /** The candidate's warnings, repeated in the dialog. */
  readonly proposeWarnings: Locator;

  constructor(private readonly page: Page) {
    this.rows = page.getByRole('row').filter({ has: page.getByRole('button', { name: /^Propose / }) });
    this.scores = this.rows.getByRole('cell').filter({ hasText: /^\s*\d+\s*\/100\s*$/ });
    this.proposeDialog = page.getByRole('dialog');
    this.proposeAllocation = this.proposeDialog.getByRole('combobox', { name: 'Allocation' });
    this.proposeStartDate = this.proposeDialog.getByLabel('Start date');
    this.proposeEndDate = this.proposeDialog.getByLabel('End date');
    this.proposeWarnings = this.proposeDialog.getByRole('list', { name: 'Warnings' });
  }

  async goto(requestId: number): Promise<void> {
    await this.page.goto(`/requests/${requestId}/candidates`);
  }

  row(fullName: string): Locator {
    return this.rows.filter({ has: this.proposeButton(fullName) });
  }

  reasons(fullName: string): Locator {
    return this.row(fullName).getByRole('list', { name: 'Reasons' });
  }

  warnings(fullName: string): Locator {
    return this.row(fullName).getByRole('list', { name: 'Warnings' }).getByRole('listitem');
  }

  async openPropose(fullName: string): Promise<void> {
    await this.proposeButton(fullName).click();
  }

  /** Proposes a candidate. Without a period, the dialog keeps the request's. Dates are DD/MM/YYYY. */
  async propose(fullName: string, period?: { startDate: string; endDate: string }): Promise<void> {
    await this.openPropose(fullName);
    if (period) {
      await this.proposeStartDate.fill(period.startDate);
      await this.proposeEndDate.fill(period.endDate);
    }
    await this.proposeDialog.getByRole('button', { name: 'Propose' }).click();
  }

  async cancelPropose(): Promise<void> {
    await this.proposeDialog.getByRole('button', { name: 'Cancel' }).click();
  }

  private proposeButton(fullName: string): Locator {
    return this.page.getByRole('button', { name: `Propose ${fullName}`, exact: true });
  }
}
