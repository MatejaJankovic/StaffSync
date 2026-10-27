import { APIRequestContext, APIResponse } from '@playwright/test';
import { bearer } from './AuthApi';

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  role: 'EMPLOYEE' | 'PM' | 'RM' | 'ADMIN';
  capacityPercent: number;
  temporaryPassword: string;
  departmentId?: number;
  managerId?: number;
  seniority?: 'JUNIOR' | 'MEDIOR' | 'SENIOR';
}

/** Client for /api/users (admin). */
export class UsersApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  list(): Promise<APIResponse> {
    return this.request.get('/api/users', { headers: bearer(this.token) });
  }

  create(user: NewUser): Promise<APIResponse> {
    return this.request.post('/api/users', { data: user, headers: bearer(this.token) });
  }

  deactivate(id: number): Promise<APIResponse> {
    return this.request.patch(`/api/users/${id}/deactivate`, { headers: bearer(this.token) });
  }
}
