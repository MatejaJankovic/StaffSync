import { Component, computed, inject, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { filter, switchMap } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod, Project } from '../projects/project.models';
import {
  Allocation,
  formatPendingChange,
  isCancellable,
  isWithdrawable,
} from './allocation.models';
import { AllocationService } from './allocation.service';

/**
 * The team of a project, for *Project details*: who is proposed or allocated, on which request, at
 * what percent and for which period, with the status and any change waiting for the RM.
 *
 * Everyone sees the panel, but the API only returns what the caller's role may see: the PM who owns
 * the project gets the whole team, an RM only their own people on it, an Employee only themselves.
 * The panel loads again whenever the page is opened, e.g. after a proposal from *Candidates* (US-11).
 *
 * The PM who owns the project can withdraw a proposal, or cancel an approved allocation that hasn't
 * started yet (US-12). Both change the request's status on the server (BR-10), so `changed` tells
 * the page to load it again.
 *
 * ```html
 * <app-team-panel [project]="project" (changed)="requests().reload()" />
 * ```
 */
@Component({
  selector: 'app-team-panel',
  imports: [MatButtonModule, PagedTable, PagedTableCell, StatusChip],
  templateUrl: './team-panel.html',
  styleUrl: './team-panel.scss',
})
export class TeamPanel {
  readonly project = input.required<Project>();

  /** Emits the allocation the PM has just withdrawn or cancelled. */
  readonly changed = output<Allocation>();

  private readonly allocations = inject(AllocationService);
  private readonly auth = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);

  private readonly table = viewChild.required(PagedTable<Allocation>);

  protected readonly columns: PagedTableColumn<Allocation>[] = [
    { key: 'employee', header: 'Employee', value: (allocation) => allocation.employeeName },
    { key: 'request', header: 'Request', value: (allocation) => allocation.requestTitle },
    {
      key: 'percent',
      header: 'Allocation',
      sortable: true,
      value: (allocation) => `${allocation.percent}%`,
    },
    { key: 'startDate', header: 'Period', sortable: true, value: formatPeriod },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'pendingChange', header: 'Pending change', value: formatPendingChange },
    // US-13 adds Request change to these actions
    { key: 'actions', header: '' },
  ];

  // Only the id, so editing the project doesn't reload the list
  private readonly projectId = computed(() => this.project().id);

  /** A new function reloads the table from the first page, so a different project does that. */
  protected readonly fetch = computed(() => {
    const projectId = this.projectId();
    return (query: PageQuery) => this.allocations.list(query, { projectId });
  });

  /** Only the PM who owns the project withdraws and cancels (BR-4). */
  protected readonly isOwner = computed(() => this.project().pmId === this.auth.currentUser()?.id);

  /** The API returns only what the role may see, so "no rows" means something different to each. */
  protected readonly emptyText = computed(() => {
    if (this.isOwner()) {
      return 'Nobody is on this project yet. Propose someone with Find candidates on a request.';
    }
    switch (this.auth.role()) {
      case 'RM':
        return 'Nobody from your team is on this project.';
      case 'EMPLOYEE':
        return 'You are not on this project.';
      case 'PM':
        return 'Only the project manager of this project sees its team.';
      default:
        return 'Nobody is on this project yet.';
    }
  });

  protected canWithdraw(allocation: Allocation): boolean {
    return this.isOwner() && isWithdrawable(allocation);
  }

  protected canCancel(allocation: Allocation): boolean {
    return this.isOwner() && isCancellable(allocation);
  }

  protected withdraw(allocation: Allocation): void {
    this.confirmAndCancel(
      allocation,
      {
        title: 'Withdraw proposal?',
        message: `${allocation.employeeName} will no longer be proposed for ${allocation.requestTitle}.`,
        confirmText: 'Withdraw proposal',
      },
      'Proposal withdrawn',
    );
  }

  protected cancel(allocation: Allocation): void {
    this.confirmAndCancel(
      allocation,
      {
        title: 'Cancel allocation?',
        message: `${allocation.employeeName} will be removed from ${allocation.projectName}.`,
        confirmText: 'Cancel allocation',
      },
      'Allocation cancelled',
    );
  }

  /** Withdraw and Cancel are the same call (§10), they only read differently. */
  private confirmAndCancel(
    allocation: Allocation,
    texts: { title: string; message: string; confirmText: string },
    successMessage: string,
  ): void {
    this.confirmDialog
      .confirm({ ...texts, cancelText: 'Keep', destructive: true })
      .pipe(
        filter(Boolean),
        switchMap(() => this.allocations.cancel(allocation.id)),
      )
      .subscribe({
        next: (cancelled) => {
          this.table().reload();
          this.notifications.success(successMessage);
          this.changed.emit(cancelled);
        },
        // The error snackbar already shows the API's message. The list is loaded again, because the
        // allocation may have changed since it was loaded (e.g. the RM decided on it)
        error: () => this.table().reload(),
      });
  }
}
