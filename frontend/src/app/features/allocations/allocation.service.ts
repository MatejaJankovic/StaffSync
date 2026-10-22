import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { Allocation, AllocationFilters } from './allocation.models';

export const ALLOCATIONS_URL = '/api/allocations';

/**
 * Talks to the allocations API. The search is filtered by role on the server: an Employee gets
 * their own allocations, a PM those on their projects, an RM those of their team, an Admin all.
 */
@Injectable({ providedIn: 'root' })
export class AllocationService {
  private readonly http = inject(HttpClient);

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
