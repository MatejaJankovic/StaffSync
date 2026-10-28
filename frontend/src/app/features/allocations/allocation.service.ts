import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { skipErrorSnackbar } from '../../core/error/error.interceptor';
import {
  Allocation,
  AllocationChange,
  AllocationChangePayload,
  AllocationFilters,
  AllocationProposal,
  PendingApproval,
  ProposeAllocationPayload,
  RejectAllocationPayload,
} from './allocation.models';

export const ALLOCATIONS_URL = '/api/allocations';

/**
 * Talks to the allocations API. The search is filtered by role on the server: an Employee gets
 * their own allocations, a PM those on their projects, an RM those of their team, an Admin all.
 * Only the PM who owns the project proposes, cancels and requests changes, and only the employee's
 * RM approves and rejects.
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

  /**
   * Asks the RM to change an approved allocation (BR-15): it becomes CHANGE_PENDING, its current
   * values stay in force until the RM decides (BR-16), and the answer lists the soft-booking warnings
   * for the new values (BR-2). The API answers 400 (BR-3, the start of a started allocation, nothing
   * changes), 403 (BR-4) and 409 (the status, a change already pending), and the error snackbar
   * shows its message.
   */
  requestChange(id: number, payload: AllocationChangePayload): Observable<AllocationChange> {
    return this.http.post<AllocationChange>(`${ALLOCATIONS_URL}/${id}/change-request`, payload);
  }

  /**
   * Withdraws the change waiting for the RM: the allocation goes back to APPROVED with its current
   * values (BR-15). The API answers 403 (BR-4) and 409 (no change is pending).
   */
  withdrawChange(id: number): Observable<Allocation> {
    return this.http.delete<Allocation>(`${ALLOCATIONS_URL}/${id}/change-request`);
  }

  /**
   * The RM's pending approvals: the proposals (NEW) and changes (CHANGE) of their own team that can
   * still be decided (BR-5, BR-7), oldest first unless `query.sort` says otherwise.
   */
  pending(query: PageQuery): Observable<Page<PendingApproval>> {
    return this.http.get<Page<PendingApproval>>(`${ALLOCATIONS_URL}/pending`, {
      params: toPageParams(query),
    });
  }

  /**
   * The RM approves a proposal or a pending change (BR-1, BR-5, BR-7, BR-15). Errors are not shown in
   * the snackbar: a 409 CAPACITY_EXCEEDED lists the overloaded days in its `details`, which the caller
   * shows in full, and it shows the message of any other error itself.
   */
  approve(id: number): Observable<Allocation> {
    return this.http.post<Allocation>(`${ALLOCATIONS_URL}/${id}/approve`, null, {
      context: skipErrorSnackbar(),
    });
  }

  /**
   * The RM rejects a proposal (it becomes REJECTED) or a pending change (the allocation goes back to
   * APPROVED with its current values), with a comment (BR-6, BR-15). The API answers 400 (the
   * comment), 403 (BR-5) and 409 (BR-7), and the error snackbar shows its message.
   */
  reject(id: number, payload: RejectAllocationPayload): Observable<Allocation> {
    return this.http.post<Allocation>(`${ALLOCATIONS_URL}/${id}/reject`, payload);
  }

  list(query: PageQuery, filters: AllocationFilters = {}): Observable<Page<Allocation>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params = params.append(key, item);
        }
      } else if (value !== undefined) {
        params = params.set(key, value);
      }
    }
    return this.http.get<Page<Allocation>>(ALLOCATIONS_URL, {
      params: toPageParams(query, params),
    });
  }
}
