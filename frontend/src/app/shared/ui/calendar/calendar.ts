import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { SsIcon } from '../icon/icon';
import {
  addDays,
  addMonths,
  clampDate,
  compareDays,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  isValidDate,
  isWithinLimits,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './date-utils';

/** A period that may be incomplete while it is being picked. */
export interface SsCalendarRange {
  start: Date | null;
  end: Date | null;
}

/** A complete period: what `rangeSelected` emits. Both days are part of it. */
export interface SsCalendarPeriod {
  start: Date;
  end: Date;
}

const LOCALE = 'en-GB';
// The text is made from the calendar parts of a day, as a moment at noon UTC and formatted in UTC:
// the day on the screen is then the day of the Date in whatever time zone the page runs in
const HEADING_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const LABEL_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const WEEKDAY_SHORT = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: 'UTC' });
const WEEKDAY_LONG = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' });

/** The same calendar day at noon UTC, for the formats above. */
function asUtcNoon(date: Date): Date {
  const utc = new Date(0);
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  utc.setUTCHours(12);
  return utc;
}

// 1 January 2024 was a Monday: seven days from it are the column headings, Monday first
const WEEKDAYS = Array.from({ length: 7 }, (_, index) => {
  const day = asUtcNoon(new Date(2024, 0, 1 + index));
  return { short: WEEKDAY_SHORT.format(day), long: WEEKDAY_LONG.format(day) };
});

/** Reads a date given to an input: no time of day, and anything that is not a real date is none. */
function toDay(value: Date | null | undefined): Date | null {
  return isValidDate(value) ? startOfDay(value) : null;
}

function toRange(value: SsCalendarRange | null | undefined): SsCalendarRange | null {
  return value ? { start: toDay(value.start), end: toDay(value.end) } : null;
}

interface DayCell {
  date: Date;
  /** A key that is unique for the calendar day, for `track`. */
  key: number;
  number: number;
  /** "2 November 2026" */
  label: string;
  disabled: boolean;
  selected: boolean;
  rangeStart: boolean;
  rangeEnd: boolean;
  inRange: boolean;
  today: boolean;
}

type CalendarRow = (DayCell | null)[];

let nextCalendarId = 0;

/**
 * A month calendar for picking a day (`mode="single"`) or a period (`mode="range"`). Weeks start
 * on Monday and the text is en-GB. It is the body of the date pickers; open it in a popup with
 * {@link SsCalendarPopup}.
 *
 * ```html
 * <ss-calendar [value]="day" [min]="today" (dateSelected)="day = $event" />
 * <ss-calendar mode="range" [range]="period" (rangeSelected)="period = $event" />
 * ```
 *
 * `value` and `range` are what is marked; the calendar also marks what the user picks, so it
 * works without feeding the selection back. In range mode the first pick is the start
 * (`rangeStarted`) and the second the end (`rangeSelected`); a second pick before the start makes
 * that day the new start. A one-day period is allowed.
 *
 * Keyboard (focus is on a day, one day is in the tab order): the arrows move by a day or a week,
 * Home and End to the Monday and the Sunday of the week (in the next or the previous month when the
 * week is split between two), Page Up and Page Down by a month, with Shift by a year, Enter or
 * Space picks. Days outside `min` to `max` are disabled: the keys stop at the limits.
 */
@Component({
  selector: 'ss-calendar',
  imports: [SsIcon],
  template: `
    <div class="ss-calendar__header">
      <button
        type="button"
        class="ss-calendar__nav"
        aria-label="Previous month"
        [attr.aria-disabled]="canGoBack() ? null : 'true'"
        (click)="previousMonth()"
      >
        <ss-icon>chevron_left</ss-icon>
      </button>
      <div class="ss-calendar__heading" aria-live="polite" [id]="headingId">{{ heading() }}</div>
      <button
        type="button"
        class="ss-calendar__nav"
        aria-label="Next month"
        [attr.aria-disabled]="canGoForward() ? null : 'true'"
        (click)="nextMonth()"
      >
        <ss-icon>chevron_right</ss-icon>
      </button>
    </div>
    <div class="ss-calendar__body">
      <table
        class="ss-calendar__grid"
        role="grid"
        [attr.aria-labelledby]="headingId"
        [attr.aria-multiselectable]="mode() === 'range' ? 'true' : null"
      >
        <thead>
          <tr role="row">
            @for (weekday of weekdays; track weekday.long) {
              <th scope="col" role="columnheader" [attr.aria-label]="weekday.long">
                {{ weekday.short }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr role="row">
              @for (cell of row; track $index) {
                @if (cell) {
                  <td
                    role="gridcell"
                    class="ss-calendar__cell"
                    [class.ss-calendar__cell--range]="cell.inRange"
                    [class.ss-calendar__cell--start]="cell.rangeStart"
                    [class.ss-calendar__cell--end]="cell.rangeEnd"
                    [attr.aria-selected]="cell.selected || cell.inRange"
                  >
                    <button
                      type="button"
                      class="ss-calendar__day"
                      [class.ss-calendar__day--selected]="cell.selected"
                      [class.ss-calendar__day--today]="cell.today"
                      [class.ss-calendar__day--disabled]="cell.disabled"
                      [attr.tabindex]="cell.key === activeKey() ? 0 : -1"
                      [attr.aria-label]="cell.label"
                      [attr.aria-disabled]="cell.disabled ? 'true' : null"
                      [attr.aria-current]="cell.today ? 'date' : null"
                      (click)="activate(cell)"
                      (keydown)="onKeydown($event, cell)"
                    >
                      {{ cell.number }}
                    </button>
                  </td>
                } @else {
                  <td role="gridcell" class="ss-calendar__cell" aria-hidden="true"></td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './calendar.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-calendar' },
})
export class SsCalendar {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** `'single'` picks one day, `'range'` picks a start and an end. */
  readonly mode = input<'single' | 'range'>('single');
  /** The marked day in single mode. */
  readonly value = input<Date | null, Date | null | undefined>(null, { transform: toDay });
  /** The marked period in range mode. */
  readonly range = input<SsCalendarRange | null, SsCalendarRange | null | undefined>(null, {
    transform: toRange,
  });
  /** Days before this one are disabled. */
  readonly min = input<Date | null, Date | null | undefined>(null, { transform: toDay });
  /** Days after this one are disabled. */
  readonly max = input<Date | null, Date | null | undefined>(null, { transform: toDay });
  /** The month shown first. Default: the value, the start of the range, or today. */
  readonly startAt = input<Date | null, Date | null | undefined>(null, { transform: toDay });

  /** A day was picked (single mode). */
  readonly dateSelected = output<Date>();
  /** The end of a period was picked (range mode): the period is complete. */
  readonly rangeSelected = output<SsCalendarPeriod>();
  /** The start of a period was picked and the end is still to come (range mode). */
  readonly rangeStarted = output<Date>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly headingId = `ss-calendar-heading-${nextCalendarId++}`;

  private readonly today = startOfDay(new Date());

  // What is marked: follows the inputs, and the user's picks until the inputs change
  private readonly selectedDay = linkedSignal(() => this.value());
  private readonly selectedRange = linkedSignal(() => this.range());
  private readonly pendingStart = linkedSignal<Date | null>(() => {
    this.range();
    this.mode();
    return null;
  });

  // Which day takes the tab stop (and is focused by the keys). Always inside the shown month.
  private readonly anchorTime = computed(() => {
    const base =
      this.startAt() ??
      (this.mode() === 'range' ? this.range()?.start : this.value()) ??
      this.today;
    return clampDate(base, this.min(), this.max()).getTime();
  });
  private readonly active = linkedSignal(() => new Date(this.anchorTime()));

  protected readonly activeKey = computed(() => this.keyOf(this.active()));
  private readonly viewMonth = computed(() => startOfMonth(this.active()), {
    equal: sameDay,
  });

  protected readonly heading = computed(() => HEADING_FORMAT.format(asUtcNoon(this.viewMonth())));

  protected readonly canGoBack = computed(() => {
    const min = this.min();
    return !min || compareDays(addDays(this.viewMonth(), -1), min) >= 0;
  });
  protected readonly canGoForward = computed(() => {
    const max = this.max();
    return !max || compareDays(addDays(endOfMonth(this.viewMonth()), 1), max) <= 0;
  });

  protected readonly rows = computed<CalendarRow[]>(() => {
    const first = this.viewMonth();
    const year = first.getFullYear();
    const month = first.getMonth();
    const { start, end } = this.markedPeriod();
    const single = this.mode() === 'single';
    const min = this.min();
    const max = this.max();

    const cells: CalendarRow = Array.from({ length: (first.getDay() + 6) % 7 }, () => null);
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      const date = addDays(first, day - 1);
      const rangeStart = !single && sameDay(date, start);
      const rangeEnd = !single && sameDay(date, end);
      cells.push({
        date,
        key: this.keyOf(date),
        number: day,
        label: LABEL_FORMAT.format(asUtcNoon(date)),
        disabled: !isWithinLimits(date, min, max),
        selected: single ? sameDay(date, start) : rangeStart || rangeEnd,
        rangeStart,
        rangeEnd,
        inRange:
          !single && !!start && !!end && compareDays(start, date) < 0 && compareDays(date, end) < 0,
        today: sameDay(date, this.today),
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  });

  /** The marked start and end: the single day as both, or the period (only the start while picking). */
  private markedPeriod(): { start: Date | null; end: Date | null } {
    if (this.mode() === 'single') {
      const day = this.selectedDay();
      return { start: day, end: day };
    }
    const pending = this.pendingStart();
    if (pending) {
      return { start: pending, end: null };
    }
    const range = this.selectedRange();
    return { start: range?.start ?? null, end: range?.end ?? null };
  }

  private keyOf(date: Date): number {
    return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
  }

  /** Moves the keyboard focus to the day that has the tab stop: the picked, the start, or today. */
  focusActiveDay(options?: FocusOptions): void {
    this.element.nativeElement
      .querySelector<HTMLElement>('.ss-calendar__day[tabindex="0"]')
      ?.focus(options);
  }

  protected previousMonth(): void {
    if (this.canGoBack()) {
      this.active.set(this.clamp(addMonths(this.active(), -1)));
    }
  }

  protected nextMonth(): void {
    if (this.canGoForward()) {
      this.active.set(this.clamp(addMonths(this.active(), 1)));
    }
  }

  /** A click, Enter or Space on a day. */
  protected activate(cell: DayCell): void {
    if (cell.disabled) {
      return;
    }
    this.active.set(cell.date);
    this.pick(cell.date);
  }

  private pick(date: Date): void {
    if (this.mode() === 'single') {
      this.selectedDay.set(date);
      this.dateSelected.emit(date);
      return;
    }
    const start = this.pendingStart();
    if (!start || compareDays(date, start) < 0) {
      // The first pick, or a pick before the start: that day starts the period
      this.pendingStart.set(date);
      this.rangeStarted.emit(date);
      return;
    }
    const period = { start, end: date };
    this.pendingStart.set(null);
    this.selectedRange.set(period);
    this.rangeSelected.emit(period);
  }

  protected onKeydown(event: KeyboardEvent, cell: DayCell): void {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const date = cell.date;
    let target: Date;
    switch (event.key) {
      case 'ArrowLeft':
        target = addDays(date, -1);
        break;
      case 'ArrowRight':
        target = addDays(date, 1);
        break;
      case 'ArrowUp':
        target = addDays(date, -7);
        break;
      case 'ArrowDown':
        target = addDays(date, 7);
        break;
      case 'PageUp':
        target = addMonths(date, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        target = addMonths(date, event.shiftKey ? 12 : 1);
        break;
      case 'Home':
        // The Monday of the week, which is in the month before when the week began there (as the
        // arrow keys do, the month shown follows)
        target = startOfWeek(date);
        break;
      case 'End':
        target = endOfWeek(date);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.activate(cell);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.active.set(this.clamp(target));
    // A new month replaces the buttons: focus the one that now has the tab stop once it exists
    afterNextRender(() => this.focusActiveDay(), { injector: this.injector });
  }

  private clamp(date: Date): Date {
    return clampDate(date, this.min(), this.max());
  }
}
