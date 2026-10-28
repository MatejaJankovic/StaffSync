import { User } from '../../core/auth/auth.models';
import { shortDate } from '../../shared/dates';
import { ProjectStatus } from '../../shared/status-chip/status-chip';

export type { ProjectStatus };

export interface Project {
  id: number;
  name: string;
  client: string;
  description: string | null;
  /** `yyyy-MM-dd` */
  startDate: string;
  /** `yyyy-MM-dd` */
  endDate: string;
  status: ProjectStatus;
  pmId: number;
  pmName: string;
}

/** What a PM sends to create or edit a project. The status isn't part of it. */
export interface ProjectRequest {
  name: string;
  client: string;
  description: string | null;
  startDate: string;
  endDate: string;
}

/** The statuses in lifecycle order (§9). */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'PLANNED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** `2026-11-01`, `2027-03-31` → `1 Nov 2026 – 31 Mar 2027` */
export function formatPeriod(project: Pick<Project, 'startDate' | 'endDate'>): string {
  return `${shortDate(project.startDate)} – ${shortDate(project.endDate)}`;
}

/**
 * The statuses a project can move to from this one (§9): `PLANNED → ACTIVE → COMPLETED`, and
 * `CANCELLED` from PLANNED or ACTIVE. The API answers 409 to anything else.
 */
export function nextStatuses(status: ProjectStatus): ProjectStatus[] {
  switch (status) {
    case 'PLANNED':
      return ['ACTIVE', 'CANCELLED'];
    case 'ACTIVE':
      return ['COMPLETED', 'CANCELLED'];
    default:
      return [];
  }
}

/** A COMPLETED or CANCELLED project can't be edited (the API answers 409). */
/**
 * Whether the user manages this project (BR-4): a PM, and its PM. The role matters too, because a PM
 * who was given another role still owns their old projects until an Admin hands them over.
 */
export function isProjectOwner(
  project: Pick<Project, 'pmId'>,
  user: Pick<User, 'id' | 'role'> | null | undefined,
): boolean {
  return !!user && user.role === 'PM' && project.pmId === user.id;
}

export function isEditable(project: Pick<Project, 'status'>): boolean {
  return project.status === 'PLANNED' || project.status === 'ACTIVE';
}
