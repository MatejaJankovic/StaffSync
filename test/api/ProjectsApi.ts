import { APIRequestContext, APIResponse } from '@playwright/test';
import { bearer } from './AuthApi';

export interface NewProject {
  name: string;
  client: string;
  description?: string;
  startDate: string;
  endDate: string;
}

/** Client for /api/projects. */
export class ProjectsApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  create(project: NewProject): Promise<APIResponse> {
    return this.request.post('/api/projects', { data: project, headers: bearer(this.token) });
  }
}
