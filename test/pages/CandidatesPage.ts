import { Locator, Page } from '@playwright/test';

/** Candidates for a staffing request (/requests/{id}/candidates) and the Propose dialog. */
export class CandidatesPage {
  /** The candidate rows, best match first (the header row left out). */
  readonly rows: Locator;
  /** The score cell of each row, e.g. "85 /100", in the order shown. */
  readonly scores: Locator;
  readonly proposeDialog: Locator;

  constructor(private readonly page: Page) {
    this.rows = page.getByRole('row').filter({ has: page.getByRole('button', { name: /^Propose / }) });
    this.scores = this.rows.getByRole('cell').filter({ hasText: /^\s*\d+\s*\/100\s*$/ });
    this.proposeDialog = page.getByRole('dialog');
  }

  async goto(requestId: number): Promise<void> {
    await this.page.goto(`/requests/${requestId}/candidates`);
  }

  row(fullName: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('button', { name: `Propose ${fullName}`, exact: true }) });
  }

  warnings(fullName: string): Locator {
    return this.row(fullName).getByRole('list', { name: 'Warnings' }).getByRole('listitem');
  }

  async openPropose(fullName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Propose ${fullName}`, exact: true }).click();
  }
}
