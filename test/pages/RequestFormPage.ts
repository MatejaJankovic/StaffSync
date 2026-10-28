import { Locator, Page } from '@playwright/test';

export interface RequestForm {
  title: string;
  /** As the list shows it: Junior, Medior or Senior */
  seniority: string;
  /** e.g. 60% */
  allocation: string;
  headcount: number;
  /** DD/MM/YYYY */
  startDate: string;
  endDate: string;
  skills: { name: string; minLevel: number; required: boolean }[];
}

/** New request (/projects/{id}/requests/new). */
export class RequestFormPage {
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  async goto(projectId: number): Promise<void> {
    await this.page.goto(`/projects/${projectId}/requests/new`);
  }

  async fill(request: RequestForm): Promise<void> {
    await this.page.getByLabel('Title').fill(request.title);
    await this.choose('Seniority', request.seniority);
    await this.choose('Allocation', request.allocation);
    await this.page.getByLabel('Headcount').fill(String(request.headcount));
    await this.page.getByLabel('Start date').fill(request.startDate);
    await this.page.getByLabel('End date').fill(request.endDate);
    for (const [index, skill] of request.skills.entries()) {
      await this.page.getByRole('button', { name: 'Add skill' }).click();
      await this.page.getByRole('combobox', { name: 'Skill' }).nth(index).click();
      await this.page.getByRole('option', { name: skill.name, exact: true }).click();
      // Once a skill is chosen, its level group is named after it
      await this.page
        .getByRole('radiogroup', { name: `Minimum level of ${skill.name}` })
        .getByRole('radio', { name: `Level ${skill.minLevel}` })
        .click();
      if (!skill.required) await this.page.getByRole('checkbox', { name: 'Required' }).nth(index).uncheck();
    }
  }

  private async choose(combobox: string, option: string): Promise<void> {
    await this.page.getByRole('combobox', { name: combobox }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }
}
