import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { Project, ProjectRequest, ProjectStatus } from './project.models';

export const PROJECTS_URL = '/api/projects';

export interface ProjectFilters {
  status?: ProjectStatus;
  /** Only the projects of this project manager. */
  pmId?: number;
}

/** Talks to the projects API. Everyone can read, a PM creates, edits and changes the status of their own. */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);

  list(query: PageQuery, filters: ProjectFilters = {}): Observable<Page<Project>> {
    let params = new HttpParams();
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.pmId !== undefined) {
      params = params.set('pmId', filters.pmId);
    }
    return this.http.get<Page<Project>>(PROJECTS_URL, { params: toPageParams(query, params) });
  }

  get(id: number): Observable<Project> {
    return this.http.get<Project>(`${PROJECTS_URL}/${id}`);
  }

  create(request: ProjectRequest): Observable<Project> {
    return this.http.post<Project>(PROJECTS_URL, request);
  }

  update(id: number, request: ProjectRequest): Observable<Project> {
    return this.http.put<Project>(`${PROJECTS_URL}/${id}`, request);
  }

  /** Completing or cancelling also runs the BR-11 clean-up on the server. */
  changeStatus(id: number, status: ProjectStatus): Observable<Project> {
    return this.http.patch<Project>(`${PROJECTS_URL}/${id}/status`, { status });
  }
}
