import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ME_URL } from '../../core/auth/auth.service';
import { EmployeeSkill, EmployeeSkillRequest, Profile } from './profile.models';

export function userSkillsUrl(userId: number): string {
  return `/api/users/${userId}/skills`;
}

/** The current user's profile and anyone's skills. Only the user or an Admin can save skills. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  me(): Observable<Profile> {
    return this.http.get<Profile>(ME_URL);
  }

  skills(userId: number): Observable<EmployeeSkill[]> {
    return this.http.get<EmployeeSkill[]>(userSkillsUrl(userId));
  }

  /** Replaces the whole list: skills left out are removed. */
  saveSkills(userId: number, skills: EmployeeSkillRequest[]): Observable<EmployeeSkill[]> {
    return this.http.put<EmployeeSkill[]>(userSkillsUrl(userId), skills);
  }
}
