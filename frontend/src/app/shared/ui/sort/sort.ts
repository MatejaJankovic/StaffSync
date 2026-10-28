import { CdkColumnDef } from '@angular/cdk/table';
import {
  booleanAttribute,
  Component,
  Directive,
  inject,
  input,
  model,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { SsIcon } from '../icon/icon';

export type SsSortDirection = 'asc' | 'desc' | '';

/** What `ssSortChange` emits, shaped like Material's `Sort`. */
export interface SsSortChange {
  active: string;
  direction: SsSortDirection;
}

/**
 * Put on a table to make its `ss-sort-header` cells sortable. It holds which column is sorted and
 * in which direction, and emits when the user changes it.
 *
 * ```html
 * <table cdk-table ssSort (ssSortChange)="sort.set($event)">
 *   <ng-container cdkColumnDef="name">
 *     <th cdk-header-cell *cdkHeaderCellDef ss-sort-header>Name</th>
 *     ...
 * ```
 *
 * Clicking a header cycles ascending, descending, then no sort. `direction` is `''` for no sort.
 */
@Directive({ selector: '[ssSort]', exportAs: 'ssSort' })
export class SsSort {
  readonly active = model('', { alias: 'ssSortActive' });
  readonly direction = model<SsSortDirection>('', { alias: 'ssSortDirection' });
  readonly ssSortChange = output<SsSortChange>();

  /**
   * Sorts by a column from code, like Material's `MatSort.sort()`: a column that is not the sorted
   * one yet starts in `start` (default ascending), the sorted one moves to its next state.
   */
  sort(column: { id: string; start?: 'asc' | 'desc'; disableClear?: boolean }): void {
    this.toggle(column.id, column.start ?? 'asc', column.disableClear ?? false);
  }

  /**
   * Called by a header: moves to the next state of that column. From `start` it goes to the
   * other direction and then to no sort (or back to `start` when `disableClear` is set).
   */
  toggle(id: string, start: 'asc' | 'desc' = 'asc', disableClear = false): void {
    const other = start === 'asc' ? 'desc' : 'asc';
    let next: SsSortDirection;
    if (this.active() !== id) {
      next = start;
    } else if (this.direction() === start) {
      next = other;
    } else if (this.direction() === other) {
      next = disableClear ? start : '';
    } else {
      next = start;
    }
    // Like Material, a cleared sort keeps its column: only the direction goes back to ''.
    this.active.set(id);
    this.direction.set(next);
    this.ssSortChange.emit({ active: id, direction: next });
  }
}

/**
 * A sortable column header. The column id is the `cdkColumnDef` name, or the value given here.
 * It is a button for the keyboard (Enter or Space) and sets `aria-sort` on the cell.
 */
@Component({
  selector: '[ss-sort-header]',
  imports: [SsIcon],
  template: `
    <div
      class="ss-sort__button"
      [class.ss-sort__button--disabled]="disabled()"
      [attr.role]="disabled() ? null : 'button'"
      [attr.tabindex]="disabled() ? null : 0"
      (click)="activate()"
      (keydown.enter)="activate()"
      (keydown.space)="$event.preventDefault(); activate()"
    >
      <span><ng-content /></span>
      @if (!disabled()) {
        <ss-icon
          class="ss-sort__arrow"
          [class.ss-sort__arrow--on]="direction()"
          [class.ss-sort__arrow--desc]="direction() === 'desc'"
        />
      }
    </div>
  `,
  styleUrl: './sort.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-sort-header',
    '[attr.aria-sort]': 'ariaSort()',
  },
})
export class SsSortHeader {
  private readonly sort = inject(SsSort);
  private readonly column = inject(CdkColumnDef, { optional: true });

  readonly idInput = input('', { alias: 'ss-sort-header' });
  readonly disabled = input(false, { transform: booleanAttribute });

  private id(): string {
    return this.idInput() || this.column?.name || '';
  }

  protected direction(): SsSortDirection {
    return this.sort.active() === this.id() ? this.sort.direction() : '';
  }

  protected ariaSort(): string | null {
    const direction = this.direction();
    return direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : null;
  }

  protected activate(): void {
    if (!this.disabled()) {
      this.sort.toggle(this.id());
    }
  }
}
