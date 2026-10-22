import { AllocationStatus } from '../../shared/status-chip/status-chip';
import { formatPeriod } from '../projects/project.models';

export type { AllocationStatus };

/** An employee allocated to a staffing request (`GET /api/allocations`). */
export interface Allocation {
  id: number;
  employeeId: number;
  employeeName: string;
  projectId: number;
  projectName: string;
  requestId: number;
  requestTitle: string;
  /** 10 to 100, in steps of 10 */
  percent: number;
  /** `yyyy-MM-dd` */
  startDate: string;
  /** `yyyy-MM-dd` */
  endDate: string;
  status: AllocationStatus;
  createdAt: string;
  /** The pending* fields and changeReason are set only while the status is CHANGE_PENDING (BR-15). */
  pendingPercent: number | null;
  pendingStartDate: string | null;
  pendingEndDate: string | null;
  changeReason: string | null;
}

/** What a PM sends to propose an employee for a request (`POST /api/allocations`). */
export interface ProposeAllocationPayload {
  requestId: number;
  employeeId: number;
  /** 10 to 100, in steps of 10 */
  percent: number;
  /** `yyyy-MM-dd`, inside the period of the request (BR-3) */
  startDate: string;
  /** `yyyy-MM-dd`, inside the period of the request (BR-3) */
  endDate: string;
}

/** The new PROPOSED allocation, with the soft-booking warnings that came with it (BR-2). */
export interface AllocationProposal {
  allocation: Allocation;
  /** Empty when the employee has enough capacity. A warning never blocks the proposal. */
  warnings: string[];
}

/** What `GET /api/allocations` filters by, on top of what the caller's role may see. */
export interface AllocationFilters {
  status?: AllocationStatus;
  employeeId?: number;
  projectId?: number;
  /** `yyyy-MM-dd`: only allocations whose period overlaps from–to */
  from?: string;
  to?: string;
}

/**
 * The change waiting for the RM, only what differs: `60% → 80%`, `1 Nov 2026 – 31 Jan 2027 → …`,
 * or both. Empty when no change is pending.
 */
export function formatPendingChange(allocation: Allocation): string {
  if (allocation.status !== 'CHANGE_PENDING') {
    return '';
  }
  const parts: string[] = [];
  if (allocation.pendingPercent !== null && allocation.pendingPercent !== allocation.percent) {
    parts.push(`${allocation.percent}% → ${allocation.pendingPercent}%`);
  }
  const pendingStart = allocation.pendingStartDate ?? allocation.startDate;
  const pendingEnd = allocation.pendingEndDate ?? allocation.endDate;
  if (pendingStart !== allocation.startDate || pendingEnd !== allocation.endDate) {
    parts.push(
      `${formatPeriod(allocation)} → ${formatPeriod({ startDate: pendingStart, endDate: pendingEnd })}`,
    );
  }
  return parts.length ? `${parts.join(', ')} pending` : 'Change pending';
}
