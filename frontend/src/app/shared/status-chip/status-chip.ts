import { Component, computed, input } from '@angular/core';

/** §9 */
export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RequestStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
export type AllocationStatus =
  'PROPOSED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'CHANGE_PENDING';
export type Status = ProjectStatus | RequestStatus | AllocationStatus;

export type StatusTone = 'info' | 'warning' | 'success' | 'neutral' | 'error';

/** One color per meaning, the same across projects, requests and allocations. */
export const STATUS_TONES: Record<Status, StatusTone> = {
  PLANNED: 'info',
  OPEN: 'info',
  PROPOSED: 'info',
  CHANGE_PENDING: 'warning',
  PARTIALLY_FILLED: 'warning',
  ACTIVE: 'success',
  APPROVED: 'success',
  FILLED: 'success',
  COMPLETED: 'neutral',
  REJECTED: 'error',
  CANCELLED: 'error',
};

/**
 * A colored label for a project, request or allocation status.
 *
 * ```html
 * <app-status-chip [status]="allocation.status" />
 * ```
 *
 * `PARTIALLY_FILLED` reads "Partially filled". An unknown status still shows, in the neutral
 * color. Add a new status to the types and to `STATUS_TONES` above.
 */
@Component({
  selector: 'app-status-chip',
  template: `{{ label() }}`,
  styleUrl: './status-chip.scss',
  host: {
    class: 'status-chip',
    '[class]': '"status-chip--" + tone()',
  },
})
export class StatusChip {
  /** A {@link Status}; typed as string so values from the API can be passed as they are. */
  readonly status = input.required<string>();

  readonly tone = computed<StatusTone>(() => STATUS_TONES[this.status() as Status] ?? 'neutral');

  protected readonly label = computed(() => {
    const words = this.status().toLowerCase().replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  });
}
