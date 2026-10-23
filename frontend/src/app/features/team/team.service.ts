import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TeamMember } from './team.models';

export const TEAM_URL = '/api/users/me/team';

/** Talks to the team API, which returns the RM's team with today's load. */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);

  myTeam(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(TEAM_URL);
  }
}
