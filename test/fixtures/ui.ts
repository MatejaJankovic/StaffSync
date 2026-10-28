import { APIRequestContext, test as base, expect } from '@playwright/test';
import { AuthApi } from '../api/AuthApi';
import { ProjectsApi } from '../api/ProjectsApi';
import { RequestsApi } from '../api/RequestsApi';
import { SkillsApi } from '../api/SkillsApi';
import { LoginPage } from '../pages/LoginPage';
import { API_URL } from './env';
import { PASSWORD, Persona, users } from './users';

/** A project with the §4 Java Developer request, created through the API for a UI test. */
export interface JavaRequest {
  projectId: number;
  projectName: string;
  requestId: number;
  requestTitle: string;
}

interface UiFixtures {
  /** Logs in through the login page and waits for Home. */
  loginAs: (persona: Persona) => Promise<void>;
  /** A request context on the backend, to set up data without the UI. */
  api: APIRequestContext;
  /** Ana's token, for setting up data as her. */
  anaToken: string;
  /** Creates a project and the §4 Java Developer request as Ana. */
  createJavaRequest: () => Promise<JavaRequest>;
}

export const test = base.extend<UiFixtures>({
  loginAs: async ({ page }, use) => {
    await use(async (persona) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.signIn(persona.email, PASSWORD);
      await page.waitForURL('**/home');
    });
  },

  api: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ baseURL: API_URL });
    await use(api);
    await api.dispose();
  },

  anaToken: async ({ api }, use) => {
    await use(await new AuthApi(api).tokenFor(users.ana.email, PASSWORD));
  },

  createJavaRequest: async ({ api, anaToken }, use) => {
    await use(async () => {
      const unique = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const projectName = `QA UI ${unique}`;
      const project = await new ProjectsApi(api, anaToken).create({
        name: projectName,
        client: 'QA',
        startDate: '2026-11-01',
        endDate: '2027-03-31',
      });
      expect(project.status()).toBe(201);
      const projectId = (await project.json()).id;

      const skill = await new SkillsApi(api, anaToken).idsByName();
      const requestTitle = `Java Developer ${unique}`;
      const request = await new RequestsApi(api, anaToken).create(projectId, {
        title: requestTitle,
        seniority: 'MEDIOR',
        allocationPercent: 60,
        startDate: '2026-11-01',
        endDate: '2027-01-31',
        headcount: 2,
        skills: [
          { skillId: skill.Java, minLevel: 4, mandatory: true },
          { skillId: skill.Spring, minLevel: 3, mandatory: true },
          { skillId: skill.PostgreSQL, minLevel: 2, mandatory: false },
        ],
      });
      expect(request.status()).toBe(201);
      return { projectId, projectName, requestId: (await request.json()).id, requestTitle };
    });
  },
});

export { expect };
