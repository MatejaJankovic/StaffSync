import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChildren, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { catchError, Observable, of, switchMap, tap } from 'rxjs';
import { Page, PageQuery } from '../../core/api/page';
import { PagedTableCell } from './paged-table-cell';

export interface PagedTableColumn<T> {
  /** Column id, and the property sent as `sort=<key>,asc` when the column is sortable. */
  key: string;
  header: string;
  sortable?: boolean;
  /** What the cell shows when there is no `appPagedTableCell` template. Default: `row[key]`. */
  value?: (row: T) => unknown;
}

/**
 * A Material table bound to a backend list: `{ content, page }` in, `page`/`size`/`sort` out.
 *
 * ```ts
 * protected readonly columns: PagedTableColumn<ProjectDto>[] = [
 *   { key: 'name', header: 'Name', sortable: true },
 *   { key: 'pm', header: 'Project manager', value: (p) => p.pmName },
 *   { key: 'status', header: 'Status' },
 * ];
 * // A new function (e.g. after a filter change) reloads the table from the first page
 * protected readonly fetch = computed(() => {
 *   const status = this.status();
 *   return (query: PageQuery) => this.projects.list(query, { status });
 * });
 * ```
 *
 * ```html
 * <app-paged-table [columns]="columns" [fetch]="fetch()">
 *   <ng-template appPagedTableCell="status" let-row>
 *     <app-status-chip [status]="row.status" />
 *   </ng-template>
 * </app-paged-table>
 * ```
 *
 * Errors are already shown by the global error snackbar; the table then shows no rows.
 * Call `reload()` (e.g. via `viewChild(PagedTable)`) after a change to reload the current page.
 */
@Component({
  selector: 'app-paged-table',
  imports: [
    NgTemplateOutlet,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSortModule,
    MatTableModule,
  ],
  templateUrl: './paged-table.html',
  styleUrl: './paged-table.scss',
})
export class PagedTable<T> {
  readonly columns = input.required<PagedTableColumn<T>[]>();
  readonly fetch = input.required<(query: PageQuery) => Observable<Page<T>>>();
  readonly pageSize = input(20);
  readonly pageSizeOptions = input([10, 20, 50]);
  readonly emptyText = input('No results');

  private readonly cells = contentChildren(PagedTableCell);
  protected readonly cellTemplates = computed(
    () => new Map(this.cells().map((cell) => [cell.column(), cell.template])),
  );
  protected readonly columnKeys = computed(() => this.columns().map((column) => column.key));

  protected readonly sort = signal<Sort | null>(null);
  protected readonly size = linkedSignal(() => this.pageSize());
  /** Back to the first page whenever the data source, the sort or the page size changes. */
  protected readonly pageIndex = linkedSignal({
    source: () => [this.fetch(), this.sort(), this.size()],
    computation: () => 0,
  });

  protected readonly rows = signal<T[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  private readonly reloads = signal(0);

  private readonly request = computed(() => {
    const sort = this.sort();
    return {
      fetch: this.fetch(),
      query: {
        page: this.pageIndex(),
        size: this.size(),
        ...(sort?.direction ? { sort: `${sort.active},${sort.direction}` } : {}),
      } satisfies PageQuery,
      reloads: this.reloads(),
    };
  });

  constructor() {
    toObservable(this.request)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(({ fetch, query }) => fetch(query).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.loading.set(false);
        this.rows.set(page?.content ?? []);
        this.total.set(page?.page.totalElements ?? 0);
      });
  }

  /** Fetches the current page again, e.g. after a row was changed or deleted. */
  reload(): void {
    this.reloads.update((count) => count + 1);
  }

  protected onPage(event: PageEvent): void {
    this.size.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  protected cellValue(column: PagedTableColumn<T>, row: T): unknown {
    return column.value ? column.value(row) : (row as Record<string, unknown>)[column.key];
  }
}
