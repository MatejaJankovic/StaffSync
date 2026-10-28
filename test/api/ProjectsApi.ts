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

  /** Moves the project to its next status. COMPLETED and CANCELLED run the BR-11 clean-up of its allocations. */
  changeStatus(id: number, status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'): Promise<APIResponse> {
    return this.request.patch(`/api/projects/${id}/status`, { data: { status }, headers: bearer(this.token) });
  }
}
