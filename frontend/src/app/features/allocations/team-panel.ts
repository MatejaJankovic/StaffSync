import { Component, computed, inject, input } from '@angular/core';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod, Project } from '../projects/project.models';
import { Allocation, formatPendingChange } from './allocation.models';
import { AllocationService } from './allocation.service';

/**
 * The team of a project, for *Project details*: who is proposed or allocated, on which request, at
 * what percent and for which period, with the status and any change waiting for the RM.
 *
 * Everyone sees the panel, but the API only returns what the caller's role may see: the PM who owns
 * the project gets the whole team, an RM only their own people on it, an Employee only themselves.
 * The panel loads again whenever the page is opened, e.g. after a proposal from *Candidates* (US-11).
 *
 * ```html
 * <app-team-panel [project]="project" />
 * ```
 */
@Component({
  selector: 'app-team-panel',
  imports: [PagedTable, PagedTableCell, StatusChip],
  templateUrl: './team-panel.html',
  styleUrl: './team-panel.scss',
})
export class TeamPanel {
  readonly project = input.required<Project>();

  private readonly allocations = inject(AllocationService);
  private readonly auth = inject(AuthService);

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
    // US-12 (Withdraw/Cancel) and US-13 (Request change) add an `actions` column here
  ];

  // Only the id, so editing the project doesn't reload the list
  private readonly projectId = computed(() => this.project().id);

  /** A new function reloads the table from the first page, so a different project does that. */
  protected readonly fetch = computed(() => {
    const projectId = this.projectId();
    return (query: PageQuery) => this.allocations.list(query, { projectId });
  });

  /** The API returns only what the role may see, so "no rows" means something different to each. */
  protected readonly emptyText = computed(() => {
    if (this.project().pmId === this.auth.currentUser()?.id) {
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
}
