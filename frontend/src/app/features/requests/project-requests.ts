import { Component, computed, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { SsDialog, SsButton, SsIcon } from '../../shared/ui';
import { formatPeriod, isEditable, Project } from '../projects/project.models';
import { RequestDetailsDialog, RequestDetailsDialogData } from './request-details-dialog';
import {
  canFindCandidates,
  isCancellable,
  isCancelled,
  SENIORITY_LABELS,
  StaffingRequest,
} from './request.models';
import { RequestService } from './request.service';

/**
 * The staffing requests of a project, for *Project details*: title, seniority, allocation, period,
 * headcount and status. Everyone can see the list and open a request. The PM who owns the project
 * can also add, edit and cancel requests, and find candidates for the ones that are still open.
 *
 * ```html
 * <app-project-requests [project]="project" />
 * ```
 */
@Component({
  selector: 'app-project-requests',
  imports: [SsButton, SsIcon, PagedTable, PagedTableCell, RouterLink, StatusChip],
  templateUrl: './project-requests.html',
  styleUrl: './project-requests.scss',
})
export class ProjectRequests {
  readonly project = input.required<Project>();

  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(SsDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);

  private readonly table = viewChild.required(PagedTable<StaffingRequest>);

  protected readonly columns: PagedTableColumn<StaffingRequest>[] = [
    { key: 'title', header: 'Title', sortable: true },
    {
      key: 'seniority',
      header: 'Seniority',
      sortable: true,
      value: (request) => SENIORITY_LABELS[request.seniority],
    },
    {
      key: 'allocationPercent',
      numeric: true,
      header: 'Allocation',
      sortable: true,
      value: (request) => `${request.allocationPercent}%`,
    },
    { key: 'startDate', numeric: true, header: 'Period', sortable: true, value: formatPeriod },
    { key: 'headcount', numeric: true, header: 'Headcount', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: '' },
  ];

  // Only the id, so editing the project doesn't reload the list
  private readonly projectId = computed(() => this.project().id);

  /** A new function reloads the table from the first page, so a different project does that. */
  protected readonly fetch = computed(() => {
    const projectId = this.projectId();
    return (query: PageQuery) => this.requests.list(projectId, query);
  });

  /** Only the PM who owns the project manages its requests (BR-4). */
  protected readonly isOwner = computed(() => this.project().pmId === this.auth.currentUser()?.id);

  /** Requests can't be added to, or edited on, a completed or cancelled project. */
  protected readonly canChange = computed(() => this.isOwner() && isEditable(this.project()));

  protected readonly emptyText = computed(() =>
    this.canChange()
      ? 'This project has no staffing requests yet. Create the first one with New request.'
      : 'This project has no staffing requests.',
  );

  protected readonly newRequestLink = computed(() => [
    '/projects',
    this.project().id,
    'requests',
    'new',
  ]);

  /** Loads the current page again, e.g. after the team panel cancels an allocation (BR-10). */
  reload(): void {
    this.table().reload();
  }

  protected editLink(request: StaffingRequest): (string | number)[] {
    return ['/projects', this.project().id, 'requests', request.id, 'edit'];
  }

  protected candidatesLink(request: StaffingRequest): (string | number)[] {
    return ['/requests', request.id, 'candidates'];
  }

  protected canEdit(request: StaffingRequest): boolean {
    return this.canChange() && !isCancelled(request);
  }

  protected canCancel(request: StaffingRequest): boolean {
    return this.canChange() && isCancellable(request);
  }

  protected canFindCandidates(request: StaffingRequest): boolean {
    return this.canChange() && canFindCandidates(request);
  }

  protected open(request: StaffingRequest): void {
    this.dialog.open<RequestDetailsDialog, RequestDetailsDialogData>(RequestDetailsDialog, {
      data: { request },
      width: '520px',
    });
  }

  protected cancel(request: StaffingRequest): void {
    this.confirmDialog
      .confirm({
        title: 'Cancel request?',
        message: `“${request.title}” will be cancelled and can’t be edited any more.`,
        confirmText: 'Cancel request',
        cancelText: 'Keep',
        destructive: true,
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.requests.cancel(request.id)),
      )
      .subscribe({
        next: () => {
          this.table().reload();
          this.notifications.success('Request cancelled');
        },
        // The error snackbar already shows the API's message. The list is loaded again, because the
        // request may have changed since it was loaded (e.g. an allocation was approved)
        error: () => this.table().reload(),
      });
  }
}
