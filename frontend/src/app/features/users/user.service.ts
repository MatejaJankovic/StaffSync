import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, expand, Observable, reduce } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { Role } from '../../core/auth/auth.models';
import { skipErrorSnackbar } from '../../core/error/error.interceptor';
import { CreateUserRequest, UpdateUserRequest, UserAccount } from './user.models';

export const USERS_URL = '/api/users';

export interface UserFilters {
  departmentId?: number;
  role?: Role;
  active?: boolean;
}

/**
 * Talks to the users API: an Admin or RM can list, only an Admin can change. `create` and `update`
 * skip the error snackbar, because the dialog shows their errors next to the fields.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  list(query: PageQuery, filters: UserFilters = {}): Observable<Page<UserAccount>> {
    let params = new HttpParams();
    if (filters.departmentId !== undefined) {
      params = params.set('departmentId', filters.departmentId);
    }
    if (filters.role) {
      params = params.set('role', filters.role);
    }
    if (filters.active !== undefined) {
      params = params.set('active', filters.active);
    }
    return this.http.get<Page<UserAccount>>(USERS_URL, { params: toPageParams(query, params) });
  }

  /**
   * All active resource managers, by last name, e.g. for the *Resource manager* dropdown. A page
   * holds at most 100, so the pages are fetched one after another.
   */
  resourceManagers(): Observable<UserAccount[]> {
    const pageOf = (page: number) =>
      this.list({ page, size: 100, sort: 'lastName,asc' }, { role: 'RM', active: true });
    return pageOf(0).pipe(
      expand(({ page }) => (page.number + 1 < page.totalPages ? pageOf(page.number + 1) : EMPTY)),
      reduce((managers, { content }) => [...managers, ...content], [] as UserAccount[]),
    );
  }

  create(request: CreateUserRequest): Observable<UserAccount> {
    return this.http.post<UserAccount>(USERS_URL, request, { context: skipErrorSnackbar() });
  }

  update(id: number, request: UpdateUserRequest): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${USERS_URL}/${id}`, request, {
      context: skipErrorSnackbar(),
    });
  }

  deactivate(id: number): Observable<UserAccount> {
    return this.http.patch<UserAccount>(`${USERS_URL}/${id}/deactivate`, null);
  }
}
