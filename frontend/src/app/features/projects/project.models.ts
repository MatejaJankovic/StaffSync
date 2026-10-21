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

/** A COMPLETED or CANCELLED project can't be edited (the API answers 409). */
export function isEditable(project: Pick<Project, 'status'>): boolean {
  return project.status === 'PLANNED' || project.status === 'ACTIVE';
}
