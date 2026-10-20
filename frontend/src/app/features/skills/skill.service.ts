import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Skill, SkillCategory, SkillRequest } from './skill.models';

export const SKILLS_URL = '/api/skills';

/** Talks to the skills catalog API. Everyone can read it, only an Admin can change it. */
@Injectable({ providedIn: 'root' })
export class SkillService {
  private readonly http = inject(HttpClient);

  list(category?: SkillCategory): Observable<Skill[]> {
    const params = category ? new HttpParams().set('category', category) : undefined;
    return this.http.get<Skill[]>(SKILLS_URL, { params });
  }

  create(request: SkillRequest): Observable<Skill> {
    return this.http.post<Skill>(SKILLS_URL, request);
  }

  update(id: number, request: SkillRequest): Observable<Skill> {
    return this.http.put<Skill>(`${SKILLS_URL}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${SKILLS_URL}/${id}`);
  }
}
