import { Department } from '../departments/department.models';
import { Seniority } from '../profile/profile.models';

/**
 * `GET /api/users/me/team`: a member of the RM's team with their load on today's working day
 * (the next Monday on a weekend). `free` is `capacityPercent - load`, negative if overbooked.
 */
export interface TeamMember {
  id: number;
  firstName: string;
  lastName: string;
  seniority: Seniority | null;
  department: Department | null;
  capacityPercent: number;
  load: number;
  free: number;
}
