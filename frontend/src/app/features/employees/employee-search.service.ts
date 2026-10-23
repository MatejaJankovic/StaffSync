import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { EmployeeSearchFilters, EmployeeSearchResult } from './employee-search.models';

export const EMPLOYEE_SEARCH_URL = '/api/employees/search';

/** *Employee search* for a PM or an RM: active employees by skill, seniority, department and free capacity. */
@Injectable({ providedIn: 'root' })
export class EmployeeSearchService {
  private readonly http = inject(HttpClient);

  /** Sends only the filters that are set. */
  search(
    query: PageQuery,
    filters: EmployeeSearchFilters = {},
  ): Observable<Page<EmployeeSearchResult>> {
    let params = new HttpParams();
    for (const [name, value] of Object.entries(filters)) {
      if (value !== undefined) {
        params = params.set(name, value);
      }
    }
    return this.http.get<Page<EmployeeSearchResult>>(EMPLOYEE_SEARCH_URL, {
      params: toPageParams(query, params),
    });
  }
}
