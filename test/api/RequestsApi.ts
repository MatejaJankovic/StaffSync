import { APIRequestContext, APIResponse } from '@playwright/test';
import { bearer } from './AuthApi';

export interface NewRequest {
  title: string;
  seniority: 'JUNIOR' | 'MEDIOR' | 'SENIOR';
  allocationPercent: number;
  startDate: string;
  endDate: string;
  headcount: number;
  skills: { skillId: number; minLevel: number; mandatory: boolean }[];
}

/** Client for staffing requests and their candidates (matching). */
export class RequestsApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  create(projectId: number, staffingRequest: NewRequest): Promise<APIResponse> {
    return this.request.post(`/api/projects/${projectId}/requests`, {
      data: staffingRequest,
      headers: bearer(this.token),
    });
  }

  get(id: number): Promise<APIResponse> {
    return this.request.get(`/api/requests/${id}`, { headers: bearer(this.token) });
  }

  candidates(id: number): Promise<APIResponse> {
    return this.request.get(`/api/requests/${id}/candidates`, { headers: bearer(this.token) });
  }
}
