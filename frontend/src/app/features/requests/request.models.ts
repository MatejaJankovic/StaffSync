import { RequestStatus } from '../../shared/status-chip/status-chip';
import { SkillCategory } from '../skills/skill.models';

export type { RequestStatus };

export type Seniority = 'JUNIOR' | 'MEDIOR' | 'SENIOR';

/** The seniority levels in display order (§5). */
export const SENIORITIES: readonly Seniority[] = ['JUNIOR', 'MEDIOR', 'SENIOR'];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  JUNIOR: 'Junior',
  MEDIOR: 'Medior',
  SENIOR: 'Senior',
};

/** §5: the allocation is 10 to 100 percent, in steps of 10. */
export const ALLOCATION_OPTIONS: readonly number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** A skill a request asks for. */
export interface RequestSkill {
  skillId: number;
  skillName: string;
  category: SkillCategory;
  /** 1 to 5 */
  minLevel: number;
  /** true = required, false = nice to have */
  mandatory: boolean;
}

export interface StaffingRequest {
  id: number;
  projectId: number;
  title: string;
  seniority: Seniority;
  allocationPercent: number;
  /** `yyyy-MM-dd` */
  startDate: string;
  /** `yyyy-MM-dd` */
  endDate: string;
  headcount: number;
  status: RequestStatus;
  createdAt: string;
  skills: RequestSkill[];
}

/** What a PM sends to create or edit a request. The status isn't part of it. */
export interface StaffingRequestPayload {
  title: string;
  seniority: Seniority;
  allocationPercent: number;
  startDate: string;
  endDate: string;
  headcount: number;
  skills: { skillId: number; minLevel: number; mandatory: boolean }[];
}

/** A cancelled request can't be edited or cancelled again (the API answers 409). */
export function isCancelled(request: Pick<StaffingRequest, 'status'>): boolean {
  return request.status === 'CANCELLED';
}

/** §9: a request can be cancelled from OPEN or PARTIALLY_FILLED, but not once it is FILLED (the API answers 409). */
export function isCancellable(request: Pick<StaffingRequest, 'status'>): boolean {
  return request.status === 'OPEN' || request.status === 'PARTIALLY_FILLED';
}

/** Candidates can be proposed on a request that is still looking for people (BR-9). */
export function canFindCandidates(request: Pick<StaffingRequest, 'status'>): boolean {
  return request.status === 'OPEN' || request.status === 'PARTIALLY_FILLED';
}
