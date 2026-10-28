import { ChangeValues } from '../../shared/change-diff/change-diff';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
import { AllocationStatus } from '../../shared/status-chip/status-chip';
import { formatPeriod } from '../projects/project.models';
import { isOverloadedDay } from '../users/user.models';

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
  /** The RM who made the last decision, on the allocation or on a change */
  decidedByName: string | null;
  /** The RM's comment: set when they rejected the proposal, or the last change (BR-6) */
  decisionComment: string | null;
}

/**
 * Why the RM said no, for the PM (BR-6): the comment of a rejected proposal, or of the last change
 * the RM rejected on an allocation that is still approved. Approving clears the comment, so an
 * approved allocation with one had its last change rejected. `null` when there is nothing to show.
 */
export function rejectionNote(
  allocation: Pick<Allocation, 'status' | 'decisionComment' | 'decidedByName'>,
): string | null {
  const comment = allocation.decisionComment;
  if (!comment) {
    return null;
  }
  const by = allocation.decidedByName ? ` by ${allocation.decidedByName}` : '';
  if (allocation.status === 'REJECTED') {
    return `Rejected${by}: ${comment}`;
  }
  if (allocation.status === 'APPROVED') {
    return `Change rejected${by}: ${comment}`;
  }
  return null;
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
  /** One or more statuses; sent as one `status` parameter each */
  status?: AllocationStatus | readonly AllocationStatus[];
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

/** NEW for a proposal (PROPOSED), CHANGE for a change to an approved allocation (CHANGE_PENDING). */
export type PendingApprovalType = 'NEW' | 'CHANGE';

/**
 * An allocation waiting for the RM's decision (`GET /api/allocations/pending`, BR-7). For a CHANGE
 * the allocation's percent and period are the current values, still in force (BR-16), and its
 * pending* fields and changeReason hold what the PM asks for (BR-15).
 */
export interface PendingApproval {
  type: PendingApprovalType;
  allocation: Allocation;
  proposedById: number;
  proposedByName: string;
  /** When the change was requested (CHANGE), or the allocation proposed (NEW): the list's order */
  awaitingSince: string;
  /** The employee's capacity % */
  capacityPercent: number;
  /** The highest daily load % if the RM approves */
  peakLoad: number;
  /** Working days approving would go over capacity; above 0, Approve answers 409 (BR-1) */
  overCapacityDays: number;
}

/** What the RM sends to reject a proposal or a change (`POST /api/allocations/{id}/reject`). */
export interface RejectAllocationPayload {
  /** 10 to 1000 characters, without the surrounding spaces (BR-6) */
  comment: string;
}

/** The values a decision is about: the proposal's, or the ones a change asks for (BR-15). */
export function requestedValues(item: PendingApproval): ChangeValues {
  const { allocation } = item;
  if (item.type === 'NEW') {
    return allocation;
  }
  return {
    percent: allocation.pendingPercent ?? allocation.percent,
    startDate: allocation.pendingStartDate ?? allocation.startDate,
    endDate: allocation.pendingEndDate ?? allocation.endDate,
  };
}

/** A run of consecutive working days on which approving would go over capacity, at the same load. */
export interface OverloadedRun {
  /** `yyyy-MM-dd` */
  start: string;
  /** `yyyy-MM-dd` */
  end: string;
  /** The total with the allocation being approved, e.g. 120 */
  load: number;
}

/**
 * The `details` of a 409 CAPACITY_EXCEEDED (`[{ date, load }]`, one per working day, BR-1) as runs
 * of consecutive working days with the same load, like the server's message: a weekend doesn't
 * break a run. Entries that aren't `{ date, load }` are skipped.
 */
export function overloadedRuns(details: readonly unknown[]): OverloadedRun[] {
  const runs: OverloadedRun[] = [];
  for (const detail of details) {
    if (!isOverloadedDay(detail)) {
      continue;
    }
    const last = runs.at(-1);
    if (last && last.load === detail.load && nextWorkingDay(last.end) === detail.date) {
      last.end = detail.date;
    } else {
      runs.push({ start: detail.date, end: detail.date, load: detail.load });
    }
  }
  return runs;
}

/** `2026-11-06` (a Friday) → `2026-11-09` (the Monday after). */
function nextWorkingDay(iso: string): string {
  const day = parseIsoDate(iso);
  do {
    day.setDate(day.getDate() + 1);
  } while (day.getDay() === 0 || day.getDay() === 6);
  return toIsoDate(day);
}
