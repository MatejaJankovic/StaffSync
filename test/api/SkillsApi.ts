import { APIRequestContext, expect } from '@playwright/test';
import { bearer } from './AuthApi';

/** Client for /api/skills, the skills catalog. */
export class SkillsApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  /** The id of each skill, by its name. */
  async idsByName(): Promise<Record<string, number>> {
    const response = await this.request.get('/api/skills', { headers: bearer(this.token) });
    expect(response.status()).toBe(200);
    const skills: { id: number; name: string }[] = await response.json();
    return Object.fromEntries(skills.map((skill) => [skill.name, skill.id]));
  }
}
