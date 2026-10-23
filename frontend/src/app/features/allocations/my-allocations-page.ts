import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { PageQuery } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { CapacityBar } from '../../shared/capacity-bar/capacity-bar';
import { toIsoDate } from '../../shared/dates';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod } from '../projects/project.models';
import { Availability } from '../users/user.models';
import { UserService } from '../users/user.service';
import { Allocation, formatPendingChange } from './allocation.models';
import { AllocationService } from './allocation.service';

/** From today to six days on, a week always holds a working day: today, or the next Monday. */
const LOOKAHEAD_DAYS = 6;

/**
 * Employee page: my allocations and my current total load (US-22). The API returns only the
 * employee's own allocations, so the list sends no filters.
 *
 * The load is that of the first working day from today, the same day the Home *Current load* card
 * and *My team* read: today, or the next Monday on a weekend.
 */
@Component({
  selector: 'app-my-allocations-page',
  imports: [CapacityBar, MatButtonModule, PagedTable, PagedTableCell, RouterLink, StatusChip],
  templateUrl: './my-allocations-page.html',
  styleUrl: './my-allocations-page.scss',
})
export class MyAllocationsPage implements OnInit {
  private readonly allocations = inject(AllocationService);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);

  protected readonly columns: PagedTableColumn<Allocation>[] = [
    { key: 'project', header: 'Project' },
    { key: 'request', header: 'Request', value: (allocation) => allocation.requestTitle },
    {
      key: 'percent',
      header: 'Allocation',
      sortable: true,
      value: (allocation) => `${allocation.percent}%`,
    },
    { key: 'startDate', header: 'Period', sortable: true, value: formatPeriod },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'pendingChange', header: 'Waiting for RM', value: formatPendingChange },
  ];

  protected readonly fetch = (query: PageQuery) => this.allocations.list(query);

  protected readonly availability = signal<Availability | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);

  /** The first working day from today; the API sends working days only, in date order. */
  protected readonly current = computed(() => {
    const availability = this.availability();
    if (!availability) {
      return null;
    }
    const capacity = availability.capacityPercent;
    const load = availability.days[0]?.load ?? 0;
    return { load, capacity, label: load > capacity ? 'Over capacity' : null };
  });

  ngOnInit(): void {
    this.loadCurrent();
  }

  protected loadCurrent(): void {
    const me = this.auth.currentUser();
    if (!me) {
      return;
    }
    const today = new Date();
    const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + LOOKAHEAD_DAYS);
    this.loading.set(true);
    this.loadFailed.set(false);
    this.users.availability(me.id, toIsoDate(today), toIsoDate(until)).subscribe({
      next: (availability) => {
        this.availability.set(availability);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }
}
