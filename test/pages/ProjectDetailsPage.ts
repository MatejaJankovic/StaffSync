import { Locator, Page } from '@playwright/test';

/** Project details (/projects/{id}): its staffing requests and its team. */
export class ProjectDetailsPage {
  readonly requests: Locator;
  readonly newRequestLink: Locator;
  readonly team: Locator;
  readonly dialog: Locator;

  constructor(private readonly page: Page) {
    this.requests = page.getByRole('region', { name: 'Staffing requests' });
    this.newRequestLink = this.requests.getByRole('link', { name: 'New request' });
    this.team = page.getByRole('region', { name: 'Team' });
    this.dialog = page.getByRole('dialog');
  }

  async goto(projectId: number): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
  }

  /** The row of a staffing request, by its title. */
  requestRow(title: string): Locator {
    return this.requests.getByRole('row').filter({ has: this.page.getByRole('cell', { name: title, exact: true }) });
  }

  async findCandidates(requestTitle: string): Promise<void> {
    await this.requestRow(requestTitle).getByRole('link', { name: 'Find candidates' }).click();
  }

  /** The row of an employee in the team panel. */
  teamRow(fullName: string): Locator {
    return this.team.getByRole('row').filter({ has: this.page.getByRole('cell', { name: fullName, exact: true }) });
  }

  /** Withdraws a proposal from the team panel, and confirms. */
  async withdraw(fullName: string, requestTitle: string): Promise<void> {
    await this.team.getByRole('button', { name: `Withdraw ${fullName} from ${requestTitle}`, exact: true }).click();
    await this.dialog.getByRole('button', { name: 'Withdraw proposal' }).click();
  }

  /** Asks the RM to change an approved allocation's percent (BR-15). */
  async requestChange(fullName: string, requestTitle: string, percent: string, reason: string): Promise<void> {
    await this.team
      .getByRole('button', { name: `Request a change for ${fullName} on ${requestTitle}`, exact: true })
      .click();
    await this.dialog.getByRole('combobox', { name: 'Allocation' }).click();
    await this.page.getByRole('option', { name: percent, exact: true }).click();
    await this.dialog.getByLabel('Reason').fill(reason);
    await this.dialog.getByRole('button', { name: 'Request change' }).click();
  }
}
