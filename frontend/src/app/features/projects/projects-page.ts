import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { SsDialog, SsField, SsLabel, SsOption, SsSelect, SsButton, SsIcon } from '../../shared/ui';
import { ProjectDialog, ProjectDialogData } from './project-dialog';
import {
  formatPeriod,
  isEditable,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  Project,
  ProjectStatus,
} from './project.models';
import { ProjectService } from './project.service';

/** PM page: the PM's own projects with a status filter, and *New project* / *Edit* dialogs. */
@Component({
  selector: 'app-projects-page',
  imports: [
    SsButton,
    SsIcon,
    PagedTable,
    PagedTableCell,
    RouterLink,
    SsField,
    SsLabel,
    SsOption,
    SsSelect,
    StatusChip,
  ],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.scss',
})
export class ProjectsPage {
  private readonly projects = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(SsDialog);
  private readonly notifications = inject(Notifications);
  private readonly router = inject(Router);

  private readonly table = viewChild.required(PagedTable<Project>);

  protected readonly statuses = PROJECT_STATUSES;
  protected readonly statusLabels = PROJECT_STATUS_LABELS;
  /** Empty means "all statuses". */
  protected readonly status = signal<ProjectStatus | ''>('');

  protected readonly columns: PagedTableColumn<Project>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'client', header: 'Client', sortable: true },
    {
      key: 'startDate',
      numeric: true,
      header: 'Period',
      sortable: true,
      value: formatPeriod,
    },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: '' },
  ];

  /** A new function reloads the table from the first page, so a filter change does that. */
  protected readonly fetch = computed(() => {
    const status = this.status() || undefined;
    // The route is PM-only, so there is always a user. Without a pmId this would list every project.
    const pmId = this.auth.currentUser()?.id;
    return (query: PageQuery) => this.projects.list(query, { status, pmId });
  });

  protected readonly emptyText = computed(() =>
    this.status()
      ? `You have no ${PROJECT_STATUS_LABELS[this.status() as ProjectStatus].toLowerCase()} projects.`
      : 'You have no projects yet. Create the first one with New project.',
  );

  protected isEditable = isEditable;

  protected open(project: Project): void {
    void this.router.navigate(['/projects', project.id]);
  }

  protected create(): void {
    this.openDialog({}, 'Project created');
  }

  protected edit(project: Project): void {
    this.openDialog({ project }, 'Project saved');
  }

  private openDialog(data: ProjectDialogData, message: string): void {
    this.dialog
      .open<ProjectDialog, ProjectDialogData, Project>(ProjectDialog, {
        data,
        width: '560px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.table().reload();
          this.notifications.success(message);
        }
      });
  }
}
