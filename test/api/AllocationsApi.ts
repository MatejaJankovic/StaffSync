import { APIRequestContext, APIResponse } from '@playwright/test';
import { bearer } from './AuthApi';

export interface Proposal {
  requestId: number;
  employeeId: number;
  percent?: number;
  startDate?: string;
  endDate?: string;
}

/** An allocation as the API returns it (AllocationDto), with the fields the tests check. */
export interface Allocation {
  id: number;
  employeeId: number;
  requestId: number;
  percent: number;
  startDate: string;
  endDate: string;
  status: 'PROPOSED' | 'APPROVED' | 'CHANGE_PENDING' | 'REJECTED' | 'CANCELLED';
  pendingPercent: number | null;
}

/** One item of the RM's pending approvals (PendingApprovalDto). */
export interface PendingApproval {
  type: 'NEW' | 'CHANGE';
  allocation: Allocation;
}

/** Client for /api/allocations: propose, decide, cancel and the pending approvals. */
export class AllocationsApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  propose(proposal: Proposal): Promise<APIResponse> {
    return this.request.post('/api/allocations', { data: proposal, headers: bearer(this.token) });
  }

  approve(id: number): Promise<APIResponse> {
    return this.request.post(`/api/allocations/${id}/approve`, { headers: bearer(this.token) });
  }

  reject(id: number, comment: string): Promise<APIResponse> {
    return this.request.post(`/api/allocations/${id}/reject`, { data: { comment }, headers: bearer(this.token) });
  }

  /** Withdraws a proposal, or cancels an approved allocation that hasn't started. */
  cancel(id: number): Promise<APIResponse> {
    return this.request.post(`/api/allocations/${id}/cancel`, { headers: bearer(this.token) });
  }

  /** The PM asks to change an approved allocation (BR-15). Values left out keep their current value. */
  requestChange(id: number, change: { percent?: number; startDate?: string; endDate?: string; reason: string }): Promise<APIResponse> {
    return this.request.post(`/api/allocations/${id}/change-request`, { data: change, headers: bearer(this.token) });
  }

  withdrawChange(id: number): Promise<APIResponse> {
    return this.request.delete(`/api/allocations/${id}/change-request`, { headers: bearer(this.token) });
  }

  pending(): Promise<APIResponse> {
    return this.request.get('/api/allocations/pending', { headers: bearer(this.token) });
  }
}
