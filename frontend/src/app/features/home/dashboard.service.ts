import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardCard } from './dashboard.models';

export const DASHBOARD_URL = '/api/dashboard';

/** Talks to the dashboard API, which returns the Home page cards for the caller's role. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  cards(): Observable<DashboardCard[]> {
    return this.http.get<DashboardCard[]>(DASHBOARD_URL);
  }
}
