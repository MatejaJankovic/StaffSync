import { toIsoDate } from '../../shared/dates';
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

/**
 * What a PM sends to change an approved allocation (`POST /api/allocations/{id}/change-request`,
 * BR-15). The dialog always sends all three values, so the ones it doesn't change stay as they are.
 */
export interface AllocationChangePayload {
  /** 10 to 100, in steps of 10 */
  percent: number;
  /** `yyyy-MM-dd`. Must stay the same once the allocation has started */
  startDate: string;
  /** `yyyy-MM-dd`, inside the period of the request (BR-3) */
  endDate: string;
  /** 10 to 1000 characters */
  reason: string;
}

/** The allocation, now CHANGE_PENDING, with the soft-booking warnings for the new values (BR-2). */
export interface AllocationChange {
  allocation: Allocation;
  /** Empty when the employee has enough capacity. A warning never blocks the change request. */
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

/** A proposal can be withdrawn by the PM (§9: PROPOSED → CANCELLED). */
export function isWithdrawable(allocation: Pick<Allocation, 'status'>): boolean {
  return allocation.status === 'PROPOSED';
}

/**
 * An approved allocation can be cancelled by the PM only before it starts (§9). It starts on its
 * start date, so on that day it is too late, as on the server. `today` is `yyyy-MM-dd`.
 */
export function isCancellable(
  allocation: Pick<Allocation, 'status' | 'startDate'>,
  today: string = toIsoDate(new Date()),
): boolean {
  return allocation.status === 'APPROVED' && allocation.startDate > today;
}

/**
 * An allocation starts on its start date, so on that day it has started, as on the server. Its start
 * date can't change from then on (BR-15, T-32). `today` is `yyyy-MM-dd`.
 */
export function hasStarted(
  allocation: Pick<Allocation, 'startDate'>,
  today: string = toIsoDate(new Date()),
): boolean {
  return allocation.startDate <= today;
}

/**
 * The PM can request a change to an approved allocation that hasn't ended (BR-15, T-33). It ends
 * after its end date, so on that day a change is still possible, as on the server.
 */
export function isChangeable(
  allocation: Pick<Allocation, 'status' | 'endDate'>,
  today: string = toIsoDate(new Date()),
): boolean {
  return allocation.status === 'APPROVED' && allocation.endDate >= today;
}

/** The change waiting for the RM can be withdrawn by the PM (BR-15, T-35). */
export function hasPendingChange(allocation: Pick<Allocation, 'status'>): boolean {
  return allocation.status === 'CHANGE_PENDING';
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
