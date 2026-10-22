import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Department, DepartmentRequest } from './department.models';

export const DEPARTMENTS_URL = '/api/departments';

/**
 * Talks to the departments API. Everyone can read it, e.g. for a department dropdown,
 * only an Admin can change it. `list()` returns every department, ordered by name.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly http = inject(HttpClient);

  list(): Observable<Department[]> {
    return this.http.get<Department[]>(DEPARTMENTS_URL);
  }

  create(request: DepartmentRequest): Observable<Department> {
    return this.http.post<Department>(DEPARTMENTS_URL, request);
  }

  update(id: number, request: DepartmentRequest): Observable<Department> {
    return this.http.put<Department>(`${DEPARTMENTS_URL}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${DEPARTMENTS_URL}/${id}`);
  }
}
