import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { filter, switchMap } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogData } from '../../shared/confirm-dialog/confirm-dialog';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod, isEditable, Project } from '../projects/project.models';
import { RequestService } from '../requests/request.service';
import {
  Allocation,
  AllocationChange,
  formatPendingChange,
  hasPendingChange,
  isCancellable,
  isChangeable,
  isWithdrawable,
} from './allocation.models';
import { AllocationService } from './allocation.service';
import { ChangeRequestDialog, ChangeRequestDialogData } from './change-request-dialog';

/** The warnings of a change request (BR-2), kept on the panel until the PM dismisses them. */
interface ChangeNotice {
  employeeName: string;
  warnings: string[];
}

/**
 * The team of a project, for *Project details*: who is proposed or allocated, on which request, at
 * what percent and for which period, with the status and any change waiting for the RM.
 *
 * Everyone sees the panel, but the API only returns what the caller's role may see: the PM who owns
 * the project gets the whole team, an RM only their own people on it, an Employee only themselves.
 * The panel loads again whenever the page is opened, e.g. after a proposal from *Candidates* (US-11).
 *
 * While the project is open, the PM who owns it can withdraw a proposal, or cancel an approved
 * allocation that hasn't started yet (US-12). Both change the request's status on the server (BR-10), so `changed` tells
 * the page to load it again.
 *
 * The PM can also request a change to an approved allocation that hasn't ended, and withdraw a change
 * that is still waiting for the RM (US-13, BR-15). Neither changes the request's status, because the
 * allocation stays active with its current values until the RM decides (BR-16).
 *
 * ```html
 * <app-team-panel [project]="project" (changed)="requests().reload()" />
 * ```
 */
@Component({
  selector: 'app-team-panel',
  imports: [MatButtonModule, MatIconModule, PagedTable, PagedTableCell, StatusChip],
  templateUrl: './team-panel.html',
  styleUrl: './team-panel.scss',
})
export class TeamPanel {
  readonly project = input.required<Project>();

  /** Emits the allocation the PM has just withdrawn or cancelled. */
  readonly changed = output<Allocation>();

  private readonly allocations = inject(AllocationService);
  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
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
    { key: 'actions', header: '' },
  ];

  /** The last change request that came back with warnings, until the PM dismisses it. */
  protected readonly changeNotice = signal<ChangeNotice | null>(null);

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

  /** A completed or cancelled project takes no cancellations (the API answers 409), as in `ProjectRequests`. */
  protected readonly canChange = computed(() => this.isOwner() && isEditable(this.project()));

  protected canWithdraw(allocation: Allocation): boolean {
    return this.canChange() && isWithdrawable(allocation);
  }

  protected canCancel(allocation: Allocation): boolean {
    return this.canChange() && isCancellable(allocation);
  }

  protected canRequestChange(allocation: Allocation): boolean {
    return this.canChange() && isChangeable(allocation);
  }

  protected canWithdrawChange(allocation: Allocation): boolean {
    return this.canChange() && hasPendingChange(allocation);
  }

  /**
   * Loads the request first, because the new period must stay inside it (BR-3). The dialog stays open
   * on an API error, so the list is only loaded again once a change has been requested.
   */
  protected requestChange(allocation: Allocation): void {
    this.requests
      .get(allocation.requestId)
      .pipe(
        switchMap((request) =>
          this.dialog
            .open<ChangeRequestDialog, ChangeRequestDialogData, AllocationChange>(
              ChangeRequestDialog,
              { data: { allocation, request }, width: '520px' },
            )
            .afterClosed(),
        ),
      )
      .subscribe((change) => {
        if (!change) {
          return;
        }
        this.table().reload();
        this.changeRequested(allocation, change);
      });
  }

  protected withdrawChange(allocation: Allocation): void {
    this.confirmDialog
      .confirm({
        title: 'Withdraw change?',
        message: `The change waiting for approval is dropped, and ${allocation.employeeName} stays at ${allocation.percent}% on ${allocation.requestTitle} for ${formatPeriod(allocation)}.`,
        confirmText: 'Withdraw change',
        cancelText: 'Keep',
        destructive: true,
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.allocations.withdrawChange(allocation.id)),
      )
      .subscribe({
        next: () => {
          this.table().reload();
          this.notifications.success('Change withdrawn');
        },
        // The error snackbar already shows the API's message, e.g. the RM has decided in the meantime
        error: () => this.table().reload(),
      });
  }

  protected dismissChangeNotice(): void {
    this.changeNotice.set(null);
  }

  /**
   * A clean change request gets a snackbar. One with warnings (BR-2) gets a notice that stays until it
   * is dismissed, because the RM can't approve the change while the capacity is short (BR-1).
   */
  private changeRequested(allocation: Allocation, { warnings }: AllocationChange): void {
    if (warnings.length === 0) {
      this.changeNotice.set(null);
      this.notifications.success('Change requested');
      return;
    }
    this.changeNotice.set({ employeeName: allocation.employeeName, warnings });
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
    texts: Pick<ConfirmDialogData, 'title' | 'message' | 'confirmText'>,
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
