import { Locator, Page } from '@playwright/test';

export interface ProjectForm {
  name: string;
  client: string;
  /** DD/MM/YYYY, as the date input expects */
  startDate: string;
  endDate: string;
}

/** My projects (/projects) and its New project dialog. */
export class ProjectsPage {
  readonly newProjectButton: Locator;
  readonly dialog: Locator;
  readonly saveButton: Locator;
  /** The error under the dates when the start is after the end. */
  readonly dateRangeError: Locator;

  constructor(private readonly page: Page) {
    this.newProjectButton = page.getByRole('button', { name: 'New project' });
    this.dialog = page.getByRole('dialog', { name: 'New project' });
    this.saveButton = this.dialog.getByRole('button', { name: 'Save' });
    this.dateRangeError = this.dialog.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/projects');
  }

  async fillNewProject(project: Partial<ProjectForm>): Promise<void> {
    await this.newProjectButton.click();
    if (project.name !== undefined) await this.dialog.getByLabel('Name').fill(project.name);
    if (project.client !== undefined) await this.dialog.getByLabel('Client').fill(project.client);
    if (project.startDate !== undefined) await this.dialog.getByLabel('Start date').fill(project.startDate);
    if (project.endDate !== undefined) {
      await this.dialog.getByLabel('End date').fill(project.endDate);
      await this.dialog.getByLabel('End date').blur();
    }
  }

  async createProject(project: ProjectForm): Promise<void> {
    await this.fillNewProject(project);
    await this.saveButton.click();
  }

  /** The row of a project in the list. */
  row(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('link', { name, exact: true }) });
  }

  /** Opens the details of a project from the list. */
  async open(name: string): Promise<void> {
    await this.row(name).getByRole('link', { name, exact: true }).click();
  }

  /** A validation message in the dialog, e.g. "Name is required". */
  dialogError(text: string): Locator {
    return this.dialog.getByText(text, { exact: true });
  }
}
