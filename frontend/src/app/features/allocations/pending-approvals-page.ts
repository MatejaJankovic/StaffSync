import { Component, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { filter, switchMap } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { apiErrorMessage, isApiError } from '../../core/api/api-error';
import { Notifications } from '../../core/error/notifications';
import { ChangeDiff } from '../../shared/change-diff/change-diff';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { shortDate } from '../../shared/dates';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod } from '../projects/project.models';
import { Allocation, overloadedRuns, PendingApproval, requestedValues } from './allocation.models';
import { AllocationService } from './allocation.service';
import { RejectDialog } from './reject-dialog';

const CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED';

/** One run of overloaded days, as the RM reads it: `2 Nov 2026 – 13 Nov 2026`, `60% + 60% = 120%`. */
interface CapacityLine {
  days: string;
  existing: number;
  added: number;
  load: number;
}

/** An approval the server refused for capacity (BR-1), kept on the page until the RM dismisses it. */
interface CapacityNotice {
  item: PendingApproval;
  lines: CapacityLine[];
  dayCount: number;
}

/**
 * RM page: *Pending approvals* (US-14, §4 steps 5–8). Everything the RM's team is waiting for, oldest
 * first: new proposals (*New*) and changes to approved allocations (*Change*, with old → new).
 *
 * *Approve* asks for confirmation, then calls the API. A capacity breach (409 CAPACITY_EXCEEDED, BR-1)
 * is shown above the list with every overloaded run of days and its load, as in §4 step 6, rather than
 * in the snackbar; nothing has changed on the server, so the item stays in the list. *Reject* opens a
 * dialog that requires a comment (BR-6). The list loads again after every decision, and after a failed
 * one, because the item may have been decided or withdrawn in the meantime.
 */
@Component({
  selector: 'app-pending-approvals-page',
  imports: [MatButtonModule, MatIconModule, ChangeDiff, PagedTable, PagedTableCell, StatusChip],
  templateUrl: './pending-approvals-page.html',
  styleUrl: './pending-approvals-page.scss',
})
export class PendingApprovalsPage {
  private readonly allocations = inject(AllocationService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);

  private readonly table = viewChild.required(PagedTable<PendingApproval>);

  protected readonly columns: PagedTableColumn<PendingApproval>[] = [
    { key: 'type', header: 'Type' },
    { key: 'employee', header: 'Employee', value: (item) => item.allocation.employeeName },
    { key: 'project', header: 'Project', value: (item) => item.allocation.projectName },
    { key: 'request', header: 'Request', value: (item) => item.allocation.requestTitle },
    // change-diff shows the percent and the period together: as they are for a proposal, and
    // old → new for a change (60% → 80%), so both kinds of row read the same way
    { key: 'values', header: 'Allocation and period' },
    { key: 'actions', header: '' },
  ];

  /** Oldest first is the server's default, and the order the RM works through the list in. */
  protected readonly fetch = (query: PageQuery) => this.allocations.pending(query);

  protected readonly requestedValues = requestedValues;

  /** The last approval refused for capacity, until the RM dismisses it or decides again. */
  protected readonly capacityNotice = signal<CapacityNotice | null>(null);

  protected approve(item: PendingApproval): void {
    const { allocation } = item;
    const requested = requestedValues(item);
    this.confirmDialog
      .confirm(
        item.type === 'CHANGE'
          ? {
              title: 'Approve change?',
              message: `${allocation.employeeName} will be at ${requested.percent}% on ${allocation.requestTitle} (${allocation.projectName}) for ${formatPeriod(requested)}, instead of ${allocation.percent}% for ${formatPeriod(allocation)}.`,
              confirmText: 'Approve change',
            }
          : {
              title: 'Approve allocation?',
              message: `${allocation.employeeName} will be allocated ${allocation.percent}% to ${allocation.requestTitle} (${allocation.projectName}) for ${formatPeriod(allocation)}.`,
              confirmText: 'Approve',
            },
      )
      .pipe(
        filter(Boolean),
        switchMap(() => this.allocations.approve(allocation.id)),
      )
      .subscribe({
        next: () => {
          this.capacityNotice.set(null);
          this.table().reload();
          this.notifications.success(
            item.type === 'CHANGE' ? 'Change approved' : 'Allocation approved',
          );
        },
        error: (error: unknown) => {
          this.table().reload();
          this.approvalFailed(item, error);
        },
      });
  }

  protected reject(item: PendingApproval): void {
    this.dialog
      .open<RejectDialog, PendingApproval, Allocation>(RejectDialog, { data: item, width: '520px' })
      .afterClosed()
      .subscribe((rejected) => {
        if (!rejected) {
          return;
        }
        this.capacityNotice.set(null);
        this.table().reload();
        this.notifications.success(
          item.type === 'CHANGE' ? 'Change rejected' : 'Allocation rejected',
        );
      });
  }

  protected dismissCapacityNotice(): void {
    this.capacityNotice.set(null);
  }

  /**
   * `approve` skips the error snackbar, so every error is shown here: a capacity breach with its days
   * above the list, anything else (403, another 409) in the snackbar as on every other page.
   */
  private approvalFailed(item: PendingApproval, error: unknown): void {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    if (!isApiError(body) || body.code !== CAPACITY_EXCEEDED) {
      this.notifications.error(apiErrorMessage(error));
      return;
    }
    const added = requestedValues(item).percent;
    const runs = overloadedRuns(body.details ?? []);
    if (runs.length === 0) {
      // No days to list, so the server's message is the most readable thing there is
      this.notifications.error(body.message);
      return;
    }
    this.capacityNotice.set({
      item,
      dayCount: (body.details ?? []).length,
      lines: runs.map((run) => ({
        days:
          run.start === run.end
            ? shortDate(run.start)
            : `${shortDate(run.start)} – ${shortDate(run.end)}`,
        existing: run.load - added,
        added,
        load: run.load,
      })),
    });
  }
}
