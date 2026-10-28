import { Component, computed, input, output, ViewEncapsulation } from '@angular/core';
import { SsButton } from '../button/button';
import { SsIcon } from '../icon/icon';
import { SsOption, SsSelect } from '../select/select';

/** What `page` emits, shaped like Material's `PageEvent`. */
export interface SsPageEvent {
  pageIndex: number;
  previousPageIndex: number;
  pageSize: number;
  length: number;
}

/**
 * Page controls for a long list: rows per page, the range shown ("21 – 40 of 134") and buttons for
 * the first, previous, next and last page. The page is zero-based.
 *
 * ```html
 * <ss-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="size()"
 *   [pageSizeOptions]="[10, 20, 50]" showFirstLastButtons (page)="onPage($event)" />
 * ```
 */
@Component({
  selector: 'ss-paginator',
  imports: [SsButton, SsIcon, SsSelect, SsOption],
  template: `
    <div class="ss-paginator__size">
      <span>Items per page:</span>
      <ss-select
        class="ss-paginator__select"
        ariaLabel="Items per page:"
        [value]="pageSize()"
        (selectionChange)="changeSize($event.value)"
      >
        @for (option of pageSizeOptions(); track option) {
          <ss-option [value]="option">{{ option }}</ss-option>
        }
      </ss-select>
    </div>
    <span class="ss-paginator__range" aria-live="polite">{{ range() }}</span>
    <div class="ss-paginator__nav">
      @if (showFirstLastButtons()) {
        <button
          ss-button="icon"
          type="button"
          aria-label="First page"
          [disabled]="!hasPrevious()"
          (click)="firstPage()"
        >
          <ss-icon>first_page</ss-icon>
        </button>
      }
      <button
        ss-button="icon"
        type="button"
        aria-label="Previous page"
        [disabled]="!hasPrevious()"
        (click)="previousPage()"
      >
        <ss-icon>chevron_left</ss-icon>
      </button>
      <button
        ss-button="icon"
        type="button"
        aria-label="Next page"
        [disabled]="!hasNext()"
        (click)="nextPage()"
      >
        <ss-icon>chevron_right</ss-icon>
      </button>
      @if (showFirstLastButtons()) {
        <button
          ss-button="icon"
          type="button"
          aria-label="Last page"
          [disabled]="!hasNext()"
          (click)="lastPage()"
        >
          <ss-icon>last_page</ss-icon>
        </button>
      }
    </div>
  `,
  styleUrl: './paginator.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-paginator', role: 'group', 'aria-label': 'Pagination' },
})
export class SsPaginator {
  readonly length = input(0);
  readonly pageIndex = input(0);
  readonly pageSize = input(20);
  readonly pageSizeOptions = input<readonly number[]>([10, 20, 50]);
  readonly showFirstLastButtons = input(false, { transform: (value: unknown) => value !== false });
  readonly page = output<SsPageEvent>();

  protected readonly lastPageIndex = computed(() =>
    Math.max(0, Math.ceil(this.length() / this.pageSize()) - 1),
  );
  protected readonly hasPrevious = computed(() => this.pageIndex() > 0);
  protected readonly hasNext = computed(() => this.pageIndex() < this.lastPageIndex());

  protected readonly range = computed(() => {
    const length = this.length();
    if (length === 0) {
      return '0 of 0';
    }
    const start = this.pageIndex() * this.pageSize();
    return `${start + 1} – ${Math.min(start + this.pageSize(), length)} of ${length}`;
  });

  /** Goes to the first page. Does nothing on the first page. Same name as Material's. */
  firstPage(): void {
    if (this.hasPrevious()) {
      this.go(0);
    }
  }

  /** Goes to the previous page. Does nothing on the first page. */
  previousPage(): void {
    if (this.hasPrevious()) {
      this.go(this.pageIndex() - 1);
    }
  }

  /** Goes to the next page. Does nothing on the last page. */
  nextPage(): void {
    if (this.hasNext()) {
      this.go(this.pageIndex() + 1);
    }
  }

  /** Goes to the last page. Does nothing on the last page. */
  lastPage(): void {
    if (this.hasNext()) {
      this.go(this.lastPageIndex());
    }
  }

  private go(index: number): void {
    this.emit(Math.max(0, Math.min(index, this.lastPageIndex())), this.pageSize());
  }

  protected changeSize(size: unknown): void {
    // Keep the first row on screen, like Material does
    const firstRow = this.pageIndex() * this.pageSize();
    const newSize = Number(size);
    this.emit(Math.floor(firstRow / newSize), newSize);
  }

  private emit(pageIndex: number, pageSize: number): void {
    this.page.emit({
      pageIndex,
      previousPageIndex: this.pageIndex(),
      pageSize,
      length: this.length(),
    });
  }
}
