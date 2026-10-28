import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describeInTimeZones, keydown } from '../testing';
import { SsCalendar, SsCalendarPeriod, SsCalendarRange } from './calendar';

@Component({
  imports: [SsCalendar],
  template: `
    <ss-calendar
      [mode]="mode()"
      [value]="value()"
      [range]="range()"
      [min]="min()"
      [max]="max()"
      [startAt]="startAt()"
      (dateSelected)="picked.push($event)"
      (rangeSelected)="periods.push($event)"
      (rangeStarted)="starts.push($event)"
    />
  `,
})
class Host {
  readonly mode = signal<'single' | 'range'>('single');
  readonly value = signal<Date | null>(null);
  readonly range = signal<SsCalendarRange | null>(null);
  readonly min = signal<Date | null>(null);
  readonly max = signal<Date | null>(null);
  readonly startAt = signal<Date | null>(null);
  readonly picked: Date[] = [];
  readonly periods: SsCalendarPeriod[] = [];
  readonly starts: Date[] = [];
}

/** A key with modifiers (the shared `keydown` helper has none). */
function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

describe('SsCalendar', () => {
  // Today is Sunday 15 November 2026, whatever the day the suite runs on
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
  });

  afterEach(() => vi.useRealTimers());

  async function render(setup?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    setup?.(fixture.componentInstance);
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const dayButtons = () =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.ss-calendar__day'));
    const day = (label: string) =>
      root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    const heading = () => root.querySelector('.ss-calendar__heading')!.textContent!.trim();
    const focusedLabel = () => document.activeElement?.getAttribute('aria-label');
    const cell = (label: string) => day(label).closest('td')!;
    const nav = (label: 'Previous month' | 'Next month') =>
      root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    const click = async (label: string) => {
      day(label).click();
      await settle();
    };
    /** Focuses a day, presses a key on it, and waits for the focus to land. */
    const keyOn = async (label: string, key: string, init?: KeyboardEventInit) => {
      day(label).focus();
      const event = init ? press(day(label), key, init) : keydown(day(label), key);
      await settle();
      return event;
    };
    return {
      fixture,
      root,
      host,
      settle,
      dayButtons,
      day,
      heading,
      focusedLabel,
      cell,
      nav,
      click,
      keyOn,
    };
  }

  describe('layout', () => {
    it('shows the month of today first, with the month and the year as its heading', async () => {
      const { heading, dayButtons } = await render();

      expect(heading()).toBe('November 2026');
      expect(dayButtons()).toHaveLength(30);
    });

    it('starts the week on Monday and names the columns', async () => {
      const { root } = await render();
      const columns = Array.from(root.querySelectorAll('thead th'));

      expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ]);
      expect(columns.map((column) => column.textContent!.trim().slice(0, 3))).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ]);
    });

    // [month, year, weekday of the 1st, empty cells before the 1st, days, rows]
    it.each([
      [5, 2026, 'Monday', 0, 30, 5],
      [8, 2026, 'Tuesday', 1, 30, 5],
      [3, 2026, 'Wednesday', 2, 30, 5],
      [0, 2026, 'Thursday', 3, 31, 5],
      [4, 2026, 'Friday', 4, 31, 5],
      [7, 2026, 'Saturday', 5, 31, 6],
      [1, 2026, 'Sunday', 6, 28, 5],
      [1, 2027, 'Monday', 0, 28, 4],
      [1, 2028, 'Tuesday', 1, 29, 5],
    ])(
      'lays out %i/%i, which starts on a %s, with the 1st in column %i',
      async (month, year, _weekday, lead, days, rows) => {
        const { root, dayButtons, cell, heading } = await render((host) =>
          host.startAt.set(new Date(year, month, 15)),
        );
        const monthName = MONTH_NAMES[month];

        expect(heading()).toBe(`${monthName} ${year}`);
        expect(dayButtons()).toHaveLength(days);
        expect((cell(`1 ${monthName} ${year}`) as HTMLTableCellElement).cellIndex).toBe(lead);
        expect(root.querySelectorAll('tbody tr')).toHaveLength(rows);
        for (const row of Array.from(root.querySelectorAll('tbody tr'))) {
          expect(row.children).toHaveLength(7);
        }
        // every day is in the column of its weekday, Monday being the first column
        for (const button of dayButtons()) {
          const number = Number(button.textContent);
          const column = (new Date(year, month, number).getDay() + 6) % 7;
          expect((button.closest('td') as HTMLTableCellElement).cellIndex).toBe(column);
        }
      },
    );

    it('has 29 days in February 2028 and 28 in February 2027 and 2100', async () => {
      const leap = await render((host) => host.startAt.set(new Date(2028, 1, 1)));
      expect(leap.dayButtons()).toHaveLength(29);
      expect(leap.day('29 February 2028')).not.toBeNull();

      const plain = await render((host) => host.startAt.set(new Date(2027, 1, 1)));
      expect(plain.dayButtons()).toHaveLength(28);
      expect(plain.day('29 February 2027')).toBeNull();

      const century = await render((host) => host.startAt.set(new Date(2100, 1, 1)));
      expect(century.dayButtons()).toHaveLength(28);
    });

    // The clocks change in Europe on the last Sunday of March and October, in the US earlier
    describeInTimeZones('days', () => {
      it.each([
        [2026, 2, 'March 2026, Europe forward on the 29th'],
        [2026, 9, 'October 2026, Europe back on the 25th'],
        [2027, 2, 'March 2027, Europe forward on the 28th'],
        [2027, 9, 'October 2027, Europe back on the 31st'],
        [2026, 10, 'November 2026, US back on the 1st'],
        [2026, 2, 'March 2026, US forward on the 8th'],
      ])(
        'has one cell per calendar day in %i/%i (%s): none twice, none skipped',
        async (year, month) => {
          const { dayButtons } = await render((host) => host.startAt.set(new Date(year, month, 1)));
          const length = new Date(year, month + 1, 0).getDate();
          const labels = dayButtons().map((button) => button.getAttribute('aria-label'));

          expect(labels).toEqual(
            Array.from({ length }, (_, index) => `${index + 1} ${MONTH_NAMES[month]} ${year}`),
          );
          expect(new Set(labels).size).toBe(length);
          expect(dayButtons().map((button) => Number(button.textContent))).toEqual(
            Array.from({ length }, (_, index) => index + 1),
          );
        },
      );

      it('walks over the clock changes with the arrow keys, a calendar day at a time', async () => {
        const march = await render((host) => host.startAt.set(new Date(2026, 2, 28)));
        await march.keyOn('28 March 2026', 'ArrowRight');
        expect(march.focusedLabel()).toBe('29 March 2026');
        await march.keyOn('29 March 2026', 'ArrowRight');
        expect(march.focusedLabel()).toBe('30 March 2026');
        await march.keyOn('30 March 2026', 'ArrowLeft');
        expect(march.focusedLabel()).toBe('29 March 2026');
        await march.keyOn('22 March 2026', 'ArrowDown');
        expect(march.focusedLabel()).toBe('29 March 2026');

        const october = await render((host) => host.startAt.set(new Date(2026, 9, 24)));
        await october.keyOn('24 October 2026', 'ArrowRight');
        expect(october.focusedLabel()).toBe('25 October 2026');
        await october.keyOn('25 October 2026', 'ArrowRight');
        expect(october.focusedLabel()).toBe('26 October 2026');
        await october.keyOn('18 October 2026', 'ArrowDown');
        expect(october.focusedLabel()).toBe('25 October 2026');

        const october2027 = await render((host) => host.startAt.set(new Date(2027, 9, 30)));
        await october2027.keyOn('30 October 2027', 'ArrowRight');
        expect(october2027.focusedLabel()).toBe('31 October 2027');
        await october2027.keyOn('31 October 2027', 'ArrowRight');
        expect(october2027.focusedLabel()).toBe('1 November 2027');
        expect(october2027.heading()).toBe('November 2027');
      });

      it('picks a day at local midnight, also on the days of a clock change', async () => {
        const { click, host } = await render((h) => h.startAt.set(new Date(2026, 2, 1)));
        await click('29 March 2026');
        await click('28 March 2026');

        expect(
          host.picked.map((date) => [date.getMonth(), date.getDate(), date.getHours()]),
        ).toEqual([
          [2, 29, 0],
          [2, 28, 0],
        ]);
      });
    });
  });

  describe('which month is shown first', () => {
    it('shows the month of the value', async () => {
      const { heading } = await render((host) => host.value.set(new Date(2027, 2, 9)));
      expect(heading()).toBe('March 2027');
    });

    it('shows the month of the start of the range in range mode, and not that of the value', async () => {
      const { heading } = await render((host) => {
        host.mode.set('range');
        host.value.set(new Date(2030, 0, 1));
        host.range.set({ start: new Date(2027, 5, 9), end: new Date(2027, 6, 2) });
      });
      expect(heading()).toBe('June 2027');
    });

    it('prefers startAt to the value and to the range', async () => {
      const { heading } = await render((host) => {
        host.value.set(new Date(2027, 2, 9));
        host.startAt.set(new Date(2025, 11, 31));
      });
      expect(heading()).toBe('December 2025');
    });

    it('shows today when there is nothing to show', async () => {
      const { heading, day } = await render((host) => host.mode.set('range'));
      expect(heading()).toBe('November 2026');
      expect(day('15 November 2026').getAttribute('tabindex')).toBe('0');
    });

    it('moves a month outside min and max to the nearest allowed day', async () => {
      const before = await render((host) => {
        host.min.set(new Date(2027, 0, 20));
        host.max.set(new Date(2027, 2, 10));
      });
      expect(before.heading()).toBe('January 2027');
      expect(before.day('20 January 2027').getAttribute('tabindex')).toBe('0');

      const after = await render((host) => {
        host.value.set(new Date(2030, 0, 1));
        host.max.set(new Date(2027, 2, 10));
      });
      expect(after.heading()).toBe('March 2027');
      expect(after.day('10 March 2027').getAttribute('tabindex')).toBe('0');
    });

    it('follows a new startAt, and leaves the month alone when an unrelated input changes', async () => {
      const { host, heading, settle, nav } = await render();
      nav('Next month').click();
      await settle();
      expect(heading()).toBe('December 2026');

      host.max.set(new Date(2030, 0, 1));
      await settle();
      expect(heading()).toBe('December 2026');

      host.startAt.set(new Date(2028, 6, 4));
      await settle();
      expect(heading()).toBe('July 2028');
    });

    it('ignores an invalid date', async () => {
      const { heading } = await render((host) => host.value.set(new Date('not a date')));
      expect(heading()).toBe('November 2026');
    });
  });

  describe('accessibility', () => {
    it('is a grid named by its heading, with a row of gridcells per week', async () => {
      const { root } = await render();
      const grid = root.querySelector('[role="grid"]')!;
      const heading = root.querySelector('.ss-calendar__heading')!;

      expect(grid.getAttribute('aria-labelledby')).toBe(heading.id);
      expect(heading.getAttribute('aria-live')).toBe('polite');
      expect(grid.querySelectorAll('tbody [role="row"]')).toHaveLength(6);
      for (const row of Array.from(grid.querySelectorAll('tbody [role="row"]'))) {
        expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(7);
      }
      expect(grid.querySelectorAll('thead [role="columnheader"]')).toHaveLength(7);
    });

    it('tells that several cells can be selected only for a period', async () => {
      const single = await render();
      expect(single.root.querySelector('[role="grid"]')!.hasAttribute('aria-multiselectable')).toBe(
        false,
      );

      const range = await render((host) => {
        host.mode.set('range');
        host.range.set({ start: new Date(2026, 10, 2), end: new Date(2026, 10, 5) });
      });
      expect(range.root.querySelector('[role="grid"]')!.getAttribute('aria-multiselectable')).toBe(
        'true',
      );
      expect(range.root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(4);
    });

    it('gives each day a button named by its full date', async () => {
      const { dayButtons } = await render();
      const labels = dayButtons().map((button) => button.getAttribute('aria-label'));

      expect(labels[0]).toBe('1 November 2026');
      expect(labels[1]).toBe('2 November 2026');
      expect(labels[29]).toBe('30 November 2026');
      for (const button of dayButtons()) {
        expect(button.getAttribute('type')).toBe('button');
        expect(button.closest('[role="gridcell"]')).not.toBeNull();
      }
    });

    it('hides the empty cells before the 1st from assistive technology', async () => {
      const { root } = await render();
      const empty = root.querySelectorAll('td[role="gridcell"][aria-hidden="true"]');

      // November 2026 starts on a Sunday: six empty cells before it and six after the 30th
      expect(empty).toHaveLength(12);
      for (const cell of Array.from(empty)) {
        expect(cell.querySelector('button')).toBeNull();
      }
    });

    it('marks today with aria-current="date" and nothing else', async () => {
      const { root, day } = await render();

      expect(root.querySelectorAll('[aria-current]')).toHaveLength(1);
      expect(day('15 November 2026').getAttribute('aria-current')).toBe('date');
      expect(day('15 November 2026').classList).toContain('ss-calendar__day--today');
    });

    it('does not mark today in another month', async () => {
      const { root } = await render((host) => host.startAt.set(new Date(2026, 5, 1)));
      expect(root.querySelectorAll('[aria-current]')).toHaveLength(0);
    });

    it('puts exactly one day in the tab order (roving tabindex), and moves it with the keys', async () => {
      const { dayButtons, day, keyOn } = await render();
      const tabStops = () =>
        dayButtons()
          .filter((button) => button.tabIndex === 0)
          .map((button) => button.getAttribute('aria-label'));

      expect(tabStops()).toEqual(['15 November 2026']);
      expect(dayButtons().filter((button) => button.tabIndex === -1)).toHaveLength(29);

      await keyOn('15 November 2026', 'ArrowRight');
      expect(tabStops()).toEqual(['16 November 2026']);
      expect(day('15 November 2026').getAttribute('tabindex')).toBe('-1');

      await keyOn('16 November 2026', 'ArrowDown');
      expect(tabStops()).toEqual(['23 November 2026']);
    });

    it('takes the tab stop to the clicked day', async () => {
      const { click, day } = await render();
      await click('20 November 2026');

      expect(day('20 November 2026').tabIndex).toBe(0);
      expect(day('15 November 2026').tabIndex).toBe(-1);
    });

    it('marks the selected day with aria-selected, and the others as not selected', async () => {
      const { root, day } = await render((host) => host.value.set(new Date(2026, 10, 9)));

      expect(day('9 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(1);
      expect(root.querySelectorAll('td[aria-selected="false"]')).toHaveLength(29);
      expect(day('9 November 2026').classList).toContain('ss-calendar__day--selected');
      expect(day('9 November 2026').tabIndex).toBe(0);
    });

    it('marks selected today as both', async () => {
      const { day } = await render((host) => host.value.set(new Date(2026, 10, 15)));

      expect(day('15 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('15 November 2026').getAttribute('aria-current')).toBe('date');
    });

    it('labels the month buttons', async () => {
      const { nav } = await render();

      expect(nav('Previous month')).not.toBeNull();
      expect(nav('Next month')).not.toBeNull();
      expect(nav('Next month').getAttribute('type')).toBe('button');
    });
  });

  describe('min and max', () => {
    const limits = (host: Host) => {
      host.min.set(new Date(2026, 10, 10));
      host.max.set(new Date(2026, 10, 20));
    };

    it('enables the two limit days and disables the day before the first and the day after the last', async () => {
      const { day } = await render(limits);

      expect(day('9 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('10 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('11 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('19 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('20 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('21 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('1 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('30 November 2026').getAttribute('aria-disabled')).toBe('true');
    });

    it('compares whole days: a limit with a time of day still allows its own day', async () => {
      const { day } = await render((host) => {
        host.min.set(new Date(2026, 10, 10, 18, 45));
        host.max.set(new Date(2026, 10, 20, 0, 5));
      });

      expect(day('10 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('20 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('9 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('21 November 2026').getAttribute('aria-disabled')).toBe('true');
    });

    it('does not pick a disabled day by click', async () => {
      const { host, click } = await render(limits);
      await click('9 November 2026');
      await click('21 November 2026');
      await click('1 November 2026');

      expect(host.picked).toEqual([]);
    });

    it('picks the limit days by click', async () => {
      const { host, click } = await render(limits);
      await click('10 November 2026');
      await click('20 November 2026');

      expect(host.picked.map((date) => date.getDate())).toEqual([10, 20]);
    });

    it('does not pick a disabled day by keyboard, even when it has the focus', async () => {
      const { host, keyOn } = await render(limits);
      await keyOn('9 November 2026', 'Enter');
      await keyOn('9 November 2026', ' ');
      await keyOn('21 November 2026', 'Enter');

      expect(host.picked).toEqual([]);
    });

    it('picks a limit day by keyboard', async () => {
      const { host, keyOn } = await render(limits);
      await keyOn('10 November 2026', 'Enter');
      await keyOn('20 November 2026', ' ');

      expect(host.picked.map((date) => date.getDate())).toEqual([10, 20]);
    });

    it('stops the arrow keys at the limits', async () => {
      const { keyOn, focusedLabel, day } = await render(limits);

      await keyOn('10 November 2026', 'ArrowLeft');
      expect(focusedLabel()).toBe('10 November 2026');
      await keyOn('10 November 2026', 'ArrowUp');
      expect(focusedLabel()).toBe('10 November 2026');
      await keyOn('20 November 2026', 'ArrowRight');
      expect(focusedLabel()).toBe('20 November 2026');
      await keyOn('20 November 2026', 'ArrowDown');
      expect(focusedLabel()).toBe('20 November 2026');
      expect(day('10 November 2026').tabIndex).toBe(-1);
      expect(day('20 November 2026').tabIndex).toBe(0);
    });

    it('moves a long jump that would leave the limits to the limit', async () => {
      const { keyOn, focusedLabel } = await render(limits);

      await keyOn('15 November 2026', 'ArrowDown');
      expect(focusedLabel()).toBe('20 November 2026');
      await keyOn('20 November 2026', 'PageUp');
      expect(focusedLabel()).toBe('10 November 2026');
      await keyOn('10 November 2026', 'PageDown');
      expect(focusedLabel()).toBe('20 November 2026');
      await keyOn('20 November 2026', 'End');
      expect(focusedLabel()).toBe('20 November 2026');
      await keyOn('10 November 2026', 'Home');
      expect(focusedLabel()).toBe('10 November 2026');
    });

    it('moves from day to day inside the limits across the end of a month', async () => {
      const { keyOn, focusedLabel, heading } = await render((host) => {
        host.min.set(new Date(2026, 9, 30));
        host.max.set(new Date(2026, 10, 2));
        host.startAt.set(new Date(2026, 9, 31));
      });

      await keyOn('31 October 2026', 'ArrowRight');
      expect(focusedLabel()).toBe('1 November 2026');
      expect(heading()).toBe('November 2026');
      await keyOn('1 November 2026', 'ArrowLeft');
      expect(focusedLabel()).toBe('31 October 2026');
      expect(heading()).toBe('October 2026');
    });

    it('disables the month buttons that would only lead to disabled days', async () => {
      const { nav, heading, settle } = await render((host) => {
        host.min.set(new Date(2026, 10, 1));
        host.max.set(new Date(2026, 10, 30));
      });

      expect(nav('Previous month').getAttribute('aria-disabled')).toBe('true');
      expect(nav('Next month').getAttribute('aria-disabled')).toBe('true');
      nav('Previous month').click();
      nav('Next month').click();
      await settle();
      expect(heading()).toBe('November 2026');
    });

    it('keeps a month button enabled while the neighbouring month has an allowed day', async () => {
      const { nav, heading, settle, day } = await render((host) => {
        host.min.set(new Date(2026, 9, 31));
        host.max.set(new Date(2026, 11, 1));
      });

      expect(nav('Previous month').getAttribute('aria-disabled')).toBeNull();
      expect(nav('Next month').getAttribute('aria-disabled')).toBeNull();

      nav('Previous month').click();
      await settle();
      expect(heading()).toBe('October 2026');
      expect(nav('Previous month').getAttribute('aria-disabled')).toBe('true');
      expect(day('30 October 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('31 October 2026').getAttribute('aria-disabled')).toBeNull();
      // the day that has the tab stop is one that can be picked
      expect(day('31 October 2026').tabIndex).toBe(0);

      nav('Next month').click();
      await settle();
      nav('Next month').click();
      await settle();
      expect(heading()).toBe('December 2026');
      expect(nav('Next month').getAttribute('aria-disabled')).toBe('true');
      expect(day('1 December 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('2 December 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('1 December 2026').tabIndex).toBe(0);
    });

    it('revalidates when min and max change', async () => {
      const { host, day, settle } = await render();
      expect(day('5 November 2026').getAttribute('aria-disabled')).toBeNull();

      host.min.set(new Date(2026, 10, 6));
      await settle();
      expect(day('5 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('6 November 2026').getAttribute('aria-disabled')).toBeNull();

      host.min.set(null);
      host.max.set(new Date(2026, 10, 4));
      await settle();
      expect(day('5 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('4 November 2026').getAttribute('aria-disabled')).toBeNull();
    });

    it('lets the user pick no disabled day in range mode either', async () => {
      const { host, click } = await render((h) => {
        h.mode.set('range');
        limits(h);
      });
      await click('9 November 2026');
      await click('21 November 2026');

      expect(host.starts).toEqual([]);
      expect(host.periods).toEqual([]);
    });
  });

  describe('keyboard', () => {
    // 18 November 2026 is a Wednesday
    const start = (host: Host) => host.startAt.set(new Date(2026, 10, 18));

    it.each([
      ['ArrowRight', '19 November 2026'],
      ['ArrowLeft', '17 November 2026'],
      ['ArrowDown', '25 November 2026'],
      ['ArrowUp', '11 November 2026'],
      ['Home', '16 November 2026'],
      ['End', '22 November 2026'],
      ['PageDown', '18 December 2026'],
      ['PageUp', '18 October 2026'],
    ])('%s from Wednesday 18 November 2026 goes to %s', async (key, expected) => {
      const { keyOn, focusedLabel } = await render(start);
      const event = await keyOn('18 November 2026', key);

      expect(focusedLabel()).toBe(expected);
      expect(event.defaultPrevented).toBe(true);
    });

    it('goes a year with Shift and Page Up or Page Down', async () => {
      const { keyOn, focusedLabel, heading } = await render(start);

      await keyOn('18 November 2026', 'PageDown', { shiftKey: true });
      expect(focusedLabel()).toBe('18 November 2027');
      expect(heading()).toBe('November 2027');

      await keyOn('18 November 2027', 'PageUp', { shiftKey: true });
      await keyOn('18 November 2026', 'PageUp', { shiftKey: true });
      expect(focusedLabel()).toBe('18 November 2025');
      expect(heading()).toBe('November 2025');
    });

    it('shows the new month when a key crosses the end of a month', async () => {
      const { keyOn, focusedLabel, heading } = await render((host) =>
        host.startAt.set(new Date(2026, 10, 30)),
      );

      await keyOn('30 November 2026', 'ArrowRight');
      expect(focusedLabel()).toBe('1 December 2026');
      expect(heading()).toBe('December 2026');

      await keyOn('1 December 2026', 'ArrowLeft');
      expect(focusedLabel()).toBe('30 November 2026');
      expect(heading()).toBe('November 2026');

      await keyOn('30 November 2026', 'ArrowDown');
      expect(focusedLabel()).toBe('7 December 2026');
      expect(heading()).toBe('December 2026');

      await keyOn('7 December 2026', 'ArrowUp');
      expect(focusedLabel()).toBe('30 November 2026');
    });

    it('crosses the end of a year in both directions', async () => {
      const { keyOn, focusedLabel, heading } = await render((host) =>
        host.startAt.set(new Date(2026, 11, 31)),
      );

      await keyOn('31 December 2026', 'ArrowRight');
      expect(focusedLabel()).toBe('1 January 2027');
      expect(heading()).toBe('January 2027');

      await keyOn('1 January 2027', 'ArrowLeft');
      expect(focusedLabel()).toBe('31 December 2026');
      expect(heading()).toBe('December 2026');

      await keyOn('31 December 2026', 'ArrowDown');
      expect(focusedLabel()).toBe('7 January 2027');

      await keyOn('7 January 2027', 'PageUp');
      expect(focusedLabel()).toBe('7 December 2026');
    });

    it('clamps Page Down to the last day of a shorter month', async () => {
      const { keyOn, focusedLabel, heading } = await render((host) =>
        host.startAt.set(new Date(2027, 0, 31)),
      );

      await keyOn('31 January 2027', 'PageDown');
      expect(focusedLabel()).toBe('28 February 2027');
      expect(heading()).toBe('February 2027');

      const leap = await render((host) => host.startAt.set(new Date(2028, 0, 31)));
      await leap.keyOn('31 January 2028', 'PageDown');
      expect(leap.focusedLabel()).toBe('29 February 2028');

      const thirtyOne = await render((host) => host.startAt.set(new Date(2026, 4, 31)));
      await thirtyOne.keyOn('31 May 2026', 'PageUp');
      expect(thirtyOne.focusedLabel()).toBe('30 April 2026');
    });

    it('moves the leap day by a year to 28 February', async () => {
      const { keyOn, focusedLabel } = await render((host) =>
        host.startAt.set(new Date(2028, 1, 29)),
      );

      await keyOn('29 February 2028', 'PageDown', { shiftKey: true });
      expect(focusedLabel()).toBe('28 February 2029');

      const back = await render((host) => host.startAt.set(new Date(2028, 1, 29)));
      await back.keyOn('29 February 2028', 'PageUp', { shiftKey: true });
      expect(back.focusedLabel()).toBe('28 February 2027');
    });

    it('goes through 29 February 2028 with the arrows', async () => {
      const { keyOn, focusedLabel } = await render((host) =>
        host.startAt.set(new Date(2028, 1, 28)),
      );

      await keyOn('28 February 2028', 'ArrowRight');
      expect(focusedLabel()).toBe('29 February 2028');
      await keyOn('29 February 2028', 'ArrowRight');
      expect(focusedLabel()).toBe('1 March 2028');
    });

    it('goes to the Monday and the Sunday of the week, into the other month when the week is split', async () => {
      // 1 November 2026 is a Sunday, 30 November a Monday: their weeks begin and end in other months
      const { keyOn, focusedLabel, heading } = await render();

      await keyOn('1 November 2026', 'End');
      expect(focusedLabel()).toBe('1 November 2026');
      expect(heading()).toBe('November 2026');
      await keyOn('1 November 2026', 'Home');
      expect(focusedLabel()).toBe('26 October 2026');
      expect(heading()).toBe('October 2026');
      await keyOn('26 October 2026', 'End');
      expect(focusedLabel()).toBe('1 November 2026');
      expect(heading()).toBe('November 2026');

      await keyOn('1 November 2026', 'PageDown');
      await keyOn('1 December 2026', 'Home');
      expect(focusedLabel()).toBe('30 November 2026');
      expect(heading()).toBe('November 2026');
      await keyOn('30 November 2026', 'End');
      expect(focusedLabel()).toBe('6 December 2026');
      expect(heading()).toBe('December 2026');

      await keyOn('9 December 2026', 'Home');
      expect(focusedLabel()).toBe('7 December 2026');
      await keyOn('9 December 2026', 'End');
      expect(focusedLabel()).toBe('13 December 2026');
    });

    it('goes from the end of the week to its start with Home on a Sunday and End on a Monday', async () => {
      const { keyOn, focusedLabel } = await render();

      await keyOn('8 November 2026', 'Home');
      expect(focusedLabel()).toBe('2 November 2026');
      await keyOn('2 November 2026', 'End');
      expect(focusedLabel()).toBe('8 November 2026');
    });

    it('picks the focused day with Enter and with Space', async () => {
      const { host, keyOn } = await render(start);
      const enter = await keyOn('18 November 2026', 'Enter');
      const space = await keyOn('19 November 2026', ' ');

      expect(host.picked.map((date) => date.getDate())).toEqual([18, 19]);
      expect(enter.defaultPrevented).toBe(true);
      expect(space.defaultPrevented).toBe(true);
    });

    it('leaves other keys alone, so Tab and Escape keep working', async () => {
      const { keyOn, host, focusedLabel } = await render(start);

      for (const key of ['Tab', 'Escape', 'a', 'Delete']) {
        const event = await keyOn('18 November 2026', key);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(host.picked).toEqual([]);
      expect(focusedLabel()).toBe('18 November 2026');
    });

    it('leaves a key with Ctrl, Alt or Meta to the browser', async () => {
      const { keyOn, host, focusedLabel } = await render(start);

      for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
        const arrow = await keyOn('18 November 2026', 'ArrowRight', init);
        const enter = await keyOn('18 November 2026', 'Enter', init);
        expect(arrow.defaultPrevented).toBe(false);
        expect(enter.defaultPrevented).toBe(false);
      }
      expect(focusedLabel()).toBe('18 November 2026');
      expect(host.picked).toEqual([]);
    });

    it('moves the focus to the new day after the month changes', async () => {
      const { keyOn, root, settle } = await render(start);
      await keyOn('18 November 2026', 'PageDown');
      await settle();

      expect(root.contains(document.activeElement)).toBe(true);
      expect(document.activeElement!.getAttribute('aria-label')).toBe('18 December 2026');
      expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
    });
  });

  describe('month buttons', () => {
    it('shows the next and the previous month', async () => {
      const { nav, heading, settle, dayButtons } = await render();

      nav('Next month').click();
      await settle();
      expect(heading()).toBe('December 2026');
      expect(dayButtons()).toHaveLength(31);

      nav('Previous month').click();
      nav('Previous month').click();
      await settle();
      expect(heading()).toBe('October 2026');
    });

    it('rolls over the year', async () => {
      const { nav, heading, settle } = await render((host) =>
        host.startAt.set(new Date(2026, 11, 1)),
      );
      nav('Next month').click();
      await settle();
      expect(heading()).toBe('January 2027');

      nav('Previous month').click();
      nav('Previous month').click();
      await settle();
      expect(heading()).toBe('November 2026');
    });

    it('takes the tab stop to the same day of the other month, or to its last day', async () => {
      const { nav, settle, day } = await render((host) => host.startAt.set(new Date(2027, 0, 31)));
      nav('Next month').click();
      await settle();

      expect(day('28 February 2027').tabIndex).toBe(0);
    });

    it('keeps the focus on the button that was pressed', async () => {
      const { nav, settle } = await render();
      nav('Next month').focus();
      nav('Next month').click();
      await settle();

      expect(document.activeElement).toBe(nav('Next month'));
    });

    it('does not pick anything', async () => {
      const { nav, settle, host } = await render();
      nav('Next month').click();
      await settle();

      expect(host.picked).toEqual([]);
      expect(host.starts).toEqual([]);
    });
  });

  describe('single mode', () => {
    it('emits the picked day at local midnight', async () => {
      const { host, click } = await render();
      await click('18 November 2026');

      expect(host.picked).toHaveLength(1);
      const date = host.picked[0];
      expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 18]);
      expect([
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
      ]).toEqual([0, 0, 0, 0]);
      expect(host.starts).toEqual([]);
      expect(host.periods).toEqual([]);
    });

    it('marks the picked day even when the value is not fed back', async () => {
      const { click, day, root } = await render();
      await click('18 November 2026');

      expect(day('18 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(1);

      await click('19 November 2026');
      expect(day('18 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('false');
      expect(day('19 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
    });

    it('emits again for the day that is already selected', async () => {
      const { host, click } = await render((h) => h.value.set(new Date(2026, 10, 18)));
      await click('18 November 2026');

      expect(host.picked.map((date) => date.getDate())).toEqual([18]);
    });

    it('follows the value when the form changes it', async () => {
      const { host, settle, day, heading } = await render((h) =>
        h.value.set(new Date(2026, 10, 18)),
      );

      host.value.set(new Date(2026, 10, 3));
      await settle();
      expect(day('3 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('18 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('false');

      host.value.set(null);
      await settle();
      expect(day('3 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('false');

      host.value.set(new Date(2027, 1, 14, 13, 45));
      await settle();
      expect(heading()).toBe('February 2027');
      expect(day('14 February 2027').closest('td')!.getAttribute('aria-selected')).toBe('true');
    });

    it('marks a value that has a time of day by its calendar day', async () => {
      const { day } = await render((host) => host.value.set(new Date(2026, 10, 18, 23, 59, 59)));
      expect(day('18 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
    });

    it('does not mark a range in single mode', async () => {
      const { root } = await render((host) =>
        host.range.set({ start: new Date(2026, 10, 3), end: new Date(2026, 10, 9) }),
      );
      expect(root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(0);
      expect(root.querySelectorAll('.ss-calendar__cell--range')).toHaveLength(0);
    });
  });

  describe('range mode', () => {
    const range = (host: Host) => host.mode.set('range');
    const selectedLabels = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('.ss-calendar__day--selected')).map((button) =>
        button.getAttribute('aria-label'),
      );
    const tintedLabels = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('.ss-calendar__cell--range')).map((cell) =>
        cell.querySelector('button')!.getAttribute('aria-label'),
      );

    it('takes the first pick as the start and tells so, without finishing', async () => {
      const { host, click, root, day } = await render(range);
      await click('10 November 2026');

      expect(host.starts.map((date) => date.getDate())).toEqual([10]);
      expect(host.periods).toEqual([]);
      expect(host.picked).toEqual([]);
      expect(selectedLabels(root)).toEqual(['10 November 2026']);
      expect(day('10 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(tintedLabels(root)).toEqual([]);
    });

    it('takes the second pick as the end and emits the period', async () => {
      const { host, click, root } = await render(range);
      await click('10 November 2026');
      await click('13 November 2026');

      expect(host.periods).toHaveLength(1);
      const { start, end } = host.periods[0];
      expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
        2026, 10, 10, 0,
      ]);
      expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([
        2026, 10, 13, 0,
      ]);
      expect(host.starts).toHaveLength(1);
      expect(selectedLabels(root)).toEqual(['10 November 2026', '13 November 2026']);
      expect(tintedLabels(root)).toEqual(['11 November 2026', '12 November 2026']);
    });

    it('restarts the period when the second pick is before the start', async () => {
      const { host, click, root } = await render(range);
      await click('10 November 2026');
      await click('5 November 2026');

      expect(host.periods).toEqual([]);
      expect(host.starts.map((date) => date.getDate())).toEqual([10, 5]);
      expect(selectedLabels(root)).toEqual(['5 November 2026']);

      await click('8 November 2026');
      expect(host.periods).toHaveLength(1);
      expect([host.periods[0].start.getDate(), host.periods[0].end.getDate()]).toEqual([5, 8]);
    });

    it('allows a period of one day: the same day twice', async () => {
      const { host, click, root, day } = await render(range);
      await click('10 November 2026');
      await click('10 November 2026');

      expect(host.periods).toHaveLength(1);
      expect([host.periods[0].start.getDate(), host.periods[0].end.getDate()]).toEqual([10, 10]);
      expect(selectedLabels(root)).toEqual(['10 November 2026']);
      expect(tintedLabels(root)).toEqual([]);
      expect(day('10 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
    });

    it('starts a new period with the pick after a complete one', async () => {
      const { host, click, root } = await render(range);
      await click('3 November 2026');
      await click('6 November 2026');
      await click('9 November 2026');

      expect(host.periods).toHaveLength(1);
      expect(host.starts.map((date) => date.getDate())).toEqual([3, 9]);
      expect(selectedLabels(root)).toEqual(['9 November 2026']);
      expect(tintedLabels(root)).toEqual([]);

      await click('12 November 2026');
      expect(host.periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [3, 6],
        [9, 12],
      ]);
    });

    it('picks the end in another month and tints the days of both months', async () => {
      const { host, click, root, nav, settle, heading } = await render((h) => {
        range(h);
        h.startAt.set(new Date(2026, 9, 1));
      });
      await click('28 October 2026');
      nav('Next month').click();
      await settle();
      await click('3 November 2026');

      expect(host.periods).toHaveLength(1);
      expect([host.periods[0].start.getMonth(), host.periods[0].end.getMonth()]).toEqual([9, 10]);
      expect(heading()).toBe('November 2026');
      expect(tintedLabels(root)).toEqual(['1 November 2026', '2 November 2026']);
      expect(selectedLabels(root)).toEqual(['3 November 2026']);

      nav('Previous month').click();
      await settle();
      expect(selectedLabels(root)).toEqual(['28 October 2026']);
      expect(tintedLabels(root)).toEqual(['29 October 2026', '30 October 2026', '31 October 2026']);
    });

    it('marks the whole period as selected for assistive technology', async () => {
      const { click, root, day } = await render(range);
      await click('10 November 2026');
      await click('12 November 2026');

      expect(root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(3);
      expect(day('11 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('13 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('false');
    });

    it('marks the start and the end as such', async () => {
      const { click, cell } = await render(range);
      await click('10 November 2026');
      await click('12 November 2026');

      expect(cell('10 November 2026').classList).toContain('ss-calendar__cell--start');
      expect(cell('12 November 2026').classList).toContain('ss-calendar__cell--end');
      expect(cell('11 November 2026').classList).toContain('ss-calendar__cell--range');
    });

    it('shows the given range', async () => {
      const { root, heading } = await render((host) => {
        range(host);
        host.range.set({ start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) });
      });

      expect(heading()).toBe('November 2026');
      expect(selectedLabels(root)).toEqual(['4 November 2026', '7 November 2026']);
      expect(tintedLabels(root)).toEqual(['5 November 2026', '6 November 2026']);
    });

    it('shows a range that has only its start', async () => {
      const { root } = await render((host) => {
        range(host);
        host.range.set({ start: new Date(2026, 10, 4), end: null });
      });

      expect(selectedLabels(root)).toEqual(['4 November 2026']);
      expect(tintedLabels(root)).toEqual([]);
    });

    it('shows a range that has only its end', async () => {
      const { root } = await render((host) => {
        range(host);
        host.range.set({ start: null, end: new Date(2026, 10, 9) });
      });

      expect(selectedLabels(root)).toEqual(['9 November 2026']);
      expect(tintedLabels(root)).toEqual([]);
    });

    it('shows only the new start while the next pick is awaited, not the old period', async () => {
      const { click, root } = await render((host) => {
        range(host);
        host.range.set({ start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) });
      });
      await click('20 November 2026');

      expect(selectedLabels(root)).toEqual(['20 November 2026']);
      expect(tintedLabels(root)).toEqual([]);
    });

    it('forgets a started period when the range is set from outside', async () => {
      const { host, click, root, settle } = await render((h) => {
        range(h);
        h.range.set({ start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) });
      });
      await click('20 November 2026');

      host.range.set({ start: new Date(2026, 10, 1), end: new Date(2026, 10, 3) });
      await settle();
      expect(selectedLabels(root)).toEqual(['1 November 2026', '3 November 2026']);

      await click('9 November 2026');
      expect(host.starts.map((date) => date.getDate())).toEqual([20, 9]);
    });

    it('does not restart the pick when the same range is given again as a new object', async () => {
      const { host, click, root, settle } = await render((h) => {
        range(h);
        h.range.set({ start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) });
      });
      await click('20 November 2026');
      host.max.set(new Date(2030, 0, 1));
      await settle();

      expect(selectedLabels(root)).toEqual(['20 November 2026']);
    });

    it('marks nothing from a started period when the mode is switched to single', async () => {
      const { host, click, settle, root } = await render(range);
      await click('10 November 2026');
      host.mode.set('single');
      await settle();

      expect(root.querySelectorAll('td[aria-selected="true"]')).toHaveLength(0);
    });

    it('picks with the keyboard like with the mouse', async () => {
      const { host, keyOn } = await render(range);
      await keyOn('10 November 2026', 'Enter');
      await keyOn('10 November 2026', 'ArrowRight');
      await keyOn('11 November 2026', ' ');

      expect(host.starts.map((date) => date.getDate())).toEqual([10]);
      expect(host.periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [10, 11],
      ]);
    });

    it('ignores a pick on a disabled day while a period is started, and goes on with the next allowed day', async () => {
      const { host, click } = await render((h) => {
        range(h);
        h.min.set(new Date(2026, 10, 10));
      });
      await click('12 November 2026');
      await click('9 November 2026');
      await click('14 November 2026');

      expect(host.starts.map((date) => date.getDate())).toEqual([12]);
      expect(host.periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [12, 14],
      ]);
    });
  });

  describe('styling hooks', () => {
    it('marks today, the selected day and the disabled days with classes the stylesheet uses', async () => {
      const { day } = await render((host) => {
        host.value.set(new Date(2026, 10, 18));
        host.min.set(new Date(2026, 10, 2));
      });

      expect(day('15 November 2026').classList).toContain('ss-calendar__day--today');
      expect(day('18 November 2026').classList).toContain('ss-calendar__day--selected');
      expect(day('1 November 2026').classList).toContain('ss-calendar__day--disabled');
      expect(day('2 November 2026').classList).not.toContain('ss-calendar__day--disabled');
    });
  });

  describe('focus', () => {
    it('focuses the day that has the tab stop on request', async () => {
      const { fixture, focusedLabel } = await render((host) =>
        host.value.set(new Date(2026, 10, 9)),
      );
      fixture.debugElement.query(By.directive(SsCalendar)).componentInstance.focusActiveDay();

      expect(focusedLabel()).toBe('9 November 2026');
    });

    it('focuses today when nothing is selected', async () => {
      const { fixture, focusedLabel } = await render();
      fixture.debugElement.query(By.directive(SsCalendar)).componentInstance.focusActiveDay();

      expect(focusedLabel()).toBe('15 November 2026');
    });
  });
});
