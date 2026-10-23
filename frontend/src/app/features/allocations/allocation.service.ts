import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import {
  Allocation,
  AllocationFilters,
  AllocationProposal,
  ProposeAllocationPayload,
} from './allocation.models';

export const ALLOCATIONS_URL = '/api/allocations';

/**
 * Talks to the allocations API. The search is filtered by role on the server: an Employee gets
 * their own allocations, a PM those on their projects, an RM those of their team, an Admin all.
 * Only the PM who owns the project proposes and cancels.
 */
@Injectable({ providedIn: 'root' })
export class AllocationService {
  private readonly http = inject(HttpClient);

  /**
   * Proposes an employee for a request: the allocation starts PROPOSED (§9), and the answer lists
   * the soft-booking warnings (BR-2). The API answers 400 (BR-3, BR-9), 403 (BR-4) and 409 (BR-8,
   * BR-9), and the error snackbar shows its message.
   */
  propose(payload: ProposeAllocationPayload): Observable<AllocationProposal> {
    return this.http.post<AllocationProposal>(ALLOCATIONS_URL, payload);
  }

  /**
   * Withdraws a proposal, or cancels an approved allocation before it starts (§9). The server then
   * recalculates the request's status (BR-10). The API answers 403 (BR-4) and 409 (the status, or
   * the allocation has already started), and the error snackbar shows its message.
   */
  cancel(id: number): Observable<Allocation> {
    return this.http.post<Allocation>(`${ALLOCATIONS_URL}/${id}/cancel`, null);
  }

  list(query: PageQuery, filters: AllocationFilters = {}): Observable<Page<Allocation>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        params = params.set(key, value);
      }
    }
    return this.http.get<Page<Allocation>>(ALLOCATIONS_URL, {
      params: toPageParams(query, params),
    });
  }
}
