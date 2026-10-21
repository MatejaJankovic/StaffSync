import { User } from '../../core/auth/auth.models';
import { SkillCategory } from '../skills/skill.models';

export type Seniority = 'JUNIOR' | 'MEDIOR' | 'SENIOR';

export const SENIORITY_LABELS: Record<Seniority, string> = {
  JUNIOR: 'Junior',
  MEDIOR: 'Medior',
  SENIOR: 'Senior',
};

/** `GET /api/auth/me`: the current user plus the personal data shown on *My profile*. */
export interface Profile extends User {
  department: string | null;
  seniority: Seniority | null;
  capacityPercent: number;
  manager: { id: number; firstName: string; lastName: string } | null;
}

export interface EmployeeSkill {
  skillId: number;
  skillName: string;
  category: SkillCategory;
  level: number;
  yearsOfExperience: number;
}

export interface EmployeeSkillRequest {
  skillId: number;
  level: number;
  yearsOfExperience: number;
}
