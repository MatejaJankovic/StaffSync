import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { skipErrorSnackbar } from '../../core/error/error.interceptor';
import { StaffingRequest, StaffingRequestPayload } from './request.models';

export const PROJECTS_URL = '/api/projects';
export const REQUESTS_URL = '/api/requests';

/**
 * Talks to the staffing requests API. Everyone can list a project's requests, the PM who owns the
 * project creates, reads, edits and cancels them.
 */
@Injectable({ providedIn: 'root' })
export class RequestService {
  private readonly http = inject(HttpClient);

  list(projectId: number, query: PageQuery): Observable<Page<StaffingRequest>> {
    return this.http.get<Page<StaffingRequest>>(`${PROJECTS_URL}/${projectId}/requests`, {
      params: toPageParams(query),
    });
  }

  get(id: number): Observable<StaffingRequest> {
    return this.http.get<StaffingRequest>(`${REQUESTS_URL}/${id}`);
  }

  /** The form shows the validation errors next to the fields, so they skip the error snackbar. */
  create(projectId: number, payload: StaffingRequestPayload): Observable<StaffingRequest> {
    return this.http.post<StaffingRequest>(`${PROJECTS_URL}/${projectId}/requests`, payload, {
      context: skipErrorSnackbar(),
    });
  }

  update(id: number, payload: StaffingRequestPayload): Observable<StaffingRequest> {
    return this.http.put<StaffingRequest>(`${REQUESTS_URL}/${id}`, payload, {
      context: skipErrorSnackbar(),
    });
  }

  /** Cancels the request (`DELETE`), which keeps it with the status `CANCELLED`. */
  cancel(id: number): Observable<StaffingRequest> {
    return this.http.delete<StaffingRequest>(`${REQUESTS_URL}/${id}`);
  }
}
