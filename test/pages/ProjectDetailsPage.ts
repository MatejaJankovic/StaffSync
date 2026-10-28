import { Locator, Page } from '@playwright/test';

/** Project details (/projects/{id}): its staffing requests and its team. */
export class ProjectDetailsPage {
  readonly requests: Locator;
  readonly newRequestLink: Locator;

  constructor(private readonly page: Page) {
    this.requests = page.getByRole('region', { name: 'Staffing requests' });
    this.newRequestLink = this.requests.getByRole('link', { name: 'New request' });
  }

  async goto(projectId: number): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
  }

  /** The row of a staffing request, by its title. */
  requestRow(title: string): Locator {
    return this.requests.getByRole('row').filter({ has: this.page.getByRole('cell', { name: title, exact: true }) });
  }
}
