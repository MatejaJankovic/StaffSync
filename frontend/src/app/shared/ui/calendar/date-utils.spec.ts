import { describeInTimeZones } from '../testing';
import {
  addDays,
  addMonths,
  addYears,
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

/** [year, month 1-12, day] of a date, to compare days without a Date in the way. */
function parts(date: Date): [number, number, number] {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

describe('calendar date utils', () => {
  describe('startOfDay', () => {
    it('drops the time of day and keeps the calendar day', () => {
      const result = startOfDay(new Date(2026, 10, 2, 23, 59, 59, 999));

      expect(parts(result)).toEqual([2026, 11, 2]);
      expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([0, 0, 0]);
    });

    it('returns a new Date and leaves the argument alone', () => {
      const original = new Date(2026, 10, 2, 9, 30);
      const result = startOfDay(original);

      expect(result).not.toBe(original);
      expect(original.getHours()).toBe(9);
    });

    it('keeps a year before 100 as that year (new Date(50, ...) would be 1950)', () => {
      const early = new Date(2000, 0, 1);
      early.setFullYear(50, 5, 15);

      expect(parts(startOfDay(early))).toEqual([50, 6, 15]);
    });
  });

  describe('addDays', () => {
    it('adds and subtracts days, across month and year ends', () => {
      expect(parts(addDays(new Date(2026, 0, 31), 1))).toEqual([2026, 2, 1]);
      expect(parts(addDays(new Date(2026, 11, 31), 1))).toEqual([2027, 1, 1]);
      expect(parts(addDays(new Date(2027, 0, 1), -1))).toEqual([2026, 12, 31]);
      expect(parts(addDays(new Date(2026, 10, 2), 0))).toEqual([2026, 11, 2]);
      expect(parts(addDays(new Date(2026, 10, 2), 7))).toEqual([2026, 11, 9]);
      expect(parts(addDays(new Date(2026, 10, 2), -45))).toEqual([2026, 9, 18]);
    });

    it('goes through 29 February in a leap year and skips it in other years', () => {
      expect(parts(addDays(new Date(2028, 1, 28), 1))).toEqual([2028, 2, 29]);
      expect(parts(addDays(new Date(2028, 1, 29), 1))).toEqual([2028, 3, 1]);
      expect(parts(addDays(new Date(2027, 1, 28), 1))).toEqual([2027, 3, 1]);
      expect(parts(addDays(new Date(2028, 0, 1), 366))).toEqual([2029, 1, 1]);
    });
  });

  describe('daysInMonth', () => {
    it('knows 28, 29, 30 and 31 day months and the century rule', () => {
      expect(daysInMonth(2027, 1)).toBe(28);
      expect(daysInMonth(2028, 1)).toBe(29);
      expect(daysInMonth(2100, 1)).toBe(28);
      expect(daysInMonth(2000, 1)).toBe(29);
      expect(daysInMonth(2026, 3)).toBe(30);
      expect(daysInMonth(2026, 0)).toBe(31);
      expect(daysInMonth(2026, 11)).toBe(31);
    });
  });

  describe('addMonths', () => {
    it('keeps the day of the month when it exists', () => {
      expect(parts(addMonths(new Date(2026, 10, 15), 1))).toEqual([2026, 12, 15]);
      expect(parts(addMonths(new Date(2026, 10, 15), -1))).toEqual([2026, 10, 15]);
      expect(parts(addMonths(new Date(2026, 10, 15), 0))).toEqual([2026, 11, 15]);
    });

    it('clamps to the last day of a shorter month: 31 January plus one month is 28 February', () => {
      expect(parts(addMonths(new Date(2027, 0, 31), 1))).toEqual([2027, 2, 28]);
      expect(parts(addMonths(new Date(2028, 0, 31), 1))).toEqual([2028, 2, 29]);
      expect(parts(addMonths(new Date(2028, 0, 30), 1))).toEqual([2028, 2, 29]);
      expect(parts(addMonths(new Date(2027, 0, 29), 1))).toEqual([2027, 2, 28]);
      expect(parts(addMonths(new Date(2026, 2, 31), 1))).toEqual([2026, 4, 30]);
      expect(parts(addMonths(new Date(2026, 4, 31), -1))).toEqual([2026, 4, 30]);
      expect(parts(addMonths(new Date(2026, 2, 31), -1))).toEqual([2026, 2, 28]);
    });

    it('does not clamp 30 or 29 January when February has that day', () => {
      expect(parts(addMonths(new Date(2028, 0, 29), 1))).toEqual([2028, 2, 29]);
      expect(parts(addMonths(new Date(2026, 6, 30), 1))).toEqual([2026, 8, 30]);
    });

    it('rolls over the year in both directions', () => {
      expect(parts(addMonths(new Date(2026, 11, 15), 1))).toEqual([2027, 1, 15]);
      expect(parts(addMonths(new Date(2026, 0, 15), -1))).toEqual([2025, 12, 15]);
      expect(parts(addMonths(new Date(2026, 10, 15), 14))).toEqual([2028, 1, 15]);
      expect(parts(addMonths(new Date(2026, 10, 15), -23))).toEqual([2024, 12, 15]);
      expect(parts(addMonths(new Date(2026, 0, 31), -13))).toEqual([2024, 12, 31]);
    });

    it('is not undone by going back when the day was clamped (that is expected)', () => {
      expect(parts(addMonths(addMonths(new Date(2027, 0, 31), 1), -1))).toEqual([2027, 1, 28]);
    });
  });

  describe('addYears', () => {
    it('adds twelve months each, and moves the leap day to 28 February in other years', () => {
      expect(parts(addYears(new Date(2026, 10, 15), 1))).toEqual([2027, 11, 15]);
      expect(parts(addYears(new Date(2026, 10, 15), -1))).toEqual([2025, 11, 15]);
      expect(parts(addYears(new Date(2028, 1, 29), 1))).toEqual([2029, 2, 28]);
      expect(parts(addYears(new Date(2028, 1, 29), -1))).toEqual([2027, 2, 28]);
      expect(parts(addYears(new Date(2028, 1, 29), 4))).toEqual([2032, 2, 29]);
    });
  });

  describe('month and week bounds', () => {
    it('finds the first and last day of the month, also in a leap February', () => {
      expect(parts(startOfMonth(new Date(2026, 10, 17)))).toEqual([2026, 11, 1]);
      expect(parts(endOfMonth(new Date(2026, 10, 17)))).toEqual([2026, 11, 30]);
      expect(parts(endOfMonth(new Date(2028, 1, 3)))).toEqual([2028, 2, 29]);
      expect(parts(endOfMonth(new Date(2027, 1, 3)))).toEqual([2027, 2, 28]);
      expect(parts(endOfMonth(new Date(2026, 11, 3)))).toEqual([2026, 12, 31]);
    });

    it.each([
      ['Monday', new Date(2026, 10, 2)],
      ['Tuesday', new Date(2026, 10, 3)],
      ['Wednesday', new Date(2026, 10, 4)],
      ['Thursday', new Date(2026, 10, 5)],
      ['Friday', new Date(2026, 10, 6)],
      ['Saturday', new Date(2026, 10, 7)],
      ['Sunday', new Date(2026, 10, 8)],
    ])('weeks run Monday to Sunday: %s is in 2 to 8 November 2026', (_weekday, date) => {
      expect(parts(startOfWeek(date))).toEqual([2026, 11, 2]);
      expect(parts(endOfWeek(date))).toEqual([2026, 11, 8]);
    });

    it('lets a week reach into the neighbouring month or year', () => {
      expect(parts(startOfWeek(new Date(2026, 10, 1)))).toEqual([2026, 10, 26]);
      expect(parts(endOfWeek(new Date(2026, 10, 30)))).toEqual([2026, 12, 6]);
      expect(parts(startOfWeek(new Date(2027, 0, 1)))).toEqual([2026, 12, 28]);
      expect(parts(endOfWeek(new Date(2026, 11, 31)))).toEqual([2027, 1, 3]);
    });
  });

  describe('compareDays and sameDay', () => {
    it('compares by calendar day and ignores the time of day', () => {
      expect(compareDays(new Date(2026, 10, 2, 23, 59), new Date(2026, 10, 2, 0, 0))).toBe(0);
      expect(compareDays(new Date(2026, 10, 2, 23, 59), new Date(2026, 10, 3, 0, 0))).toBeLessThan(
        0,
      );
      expect(
        compareDays(new Date(2026, 10, 3, 0, 0), new Date(2026, 10, 2, 23, 59)),
      ).toBeGreaterThan(0);
    });

    it('orders across months and years', () => {
      expect(compareDays(new Date(2026, 0, 31), new Date(2026, 1, 1))).toBeLessThan(0);
      expect(compareDays(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBeLessThan(0);
      expect(compareDays(new Date(2027, 0, 1), new Date(2026, 11, 31))).toBeGreaterThan(0);
      expect(compareDays(new Date(2026, 9, 31), new Date(2026, 10, 1))).toBeLessThan(0);
    });

    it('counts days, also for years before 100 (Date.UTC(50, ...) would be 1950)', () => {
      const early = new Date(2000, 0, 1);
      early.setFullYear(50, 5, 15);
      const later = new Date(2000, 0, 1);
      later.setFullYear(50, 5, 20);
      const year150 = new Date(2000, 0, 1);
      year150.setFullYear(150, 5, 15);

      expect(compareDays(later, early)).toBe(5);
      expect(compareDays(early, year150)).toBeLessThan(0);
      expect(compareDays(year150, early)).toBe(100 * 365 + 24);
    });

    it('sameDay is true for the same day at different times, and false for a missing date', () => {
      expect(sameDay(new Date(2026, 10, 2, 1), new Date(2026, 10, 2, 22))).toBe(true);
      expect(sameDay(new Date(2026, 10, 2), new Date(2026, 10, 3))).toBe(false);
      expect(sameDay(new Date(2026, 10, 2), new Date(2025, 10, 2))).toBe(false);
      expect(sameDay(null, null)).toBe(false);
      expect(sameDay(new Date(2026, 10, 2), null)).toBe(false);
      expect(sameDay(undefined, new Date(2026, 10, 2))).toBe(false);
    });
  });

  describe('clampDate and isWithinLimits', () => {
    const min = new Date(2026, 10, 10);
    const max = new Date(2026, 10, 20);

    it('keeps a day inside the limits, both limits included', () => {
      expect(parts(clampDate(new Date(2026, 10, 15), min, max))).toEqual([2026, 11, 15]);
      expect(parts(clampDate(new Date(2026, 10, 10), min, max))).toEqual([2026, 11, 10]);
      expect(parts(clampDate(new Date(2026, 10, 20), min, max))).toEqual([2026, 11, 20]);
    });

    it('moves a day outside the limits to the nearest limit', () => {
      expect(parts(clampDate(new Date(2026, 10, 9), min, max))).toEqual([2026, 11, 10]);
      expect(parts(clampDate(new Date(2026, 10, 21), min, max))).toEqual([2026, 11, 20]);
      expect(parts(clampDate(new Date(2020, 0, 1), min, max))).toEqual([2026, 11, 10]);
    });

    it('works with one limit, with none, and drops the time of day', () => {
      expect(parts(clampDate(new Date(2026, 10, 9), min))).toEqual([2026, 11, 10]);
      expect(parts(clampDate(new Date(2030, 0, 1), min, null))).toEqual([2030, 1, 1]);
      expect(parts(clampDate(new Date(2030, 0, 1), null, max))).toEqual([2026, 11, 20]);
      expect(parts(clampDate(new Date(2030, 0, 1)))).toEqual([2030, 1, 1]);
      expect(clampDate(new Date(2026, 10, 15, 18, 30), min, max).getHours()).toBe(0);
      expect(clampDate(new Date(2026, 10, 1), new Date(2026, 10, 10, 18), max).getHours()).toBe(0);
    });

    it('isWithinLimits compares whole days: the limit day is inside whatever its time', () => {
      expect(isWithinLimits(new Date(2026, 10, 10), new Date(2026, 10, 10, 18), max)).toBe(true);
      expect(isWithinLimits(new Date(2026, 10, 20, 23), min, new Date(2026, 10, 20, 1))).toBe(true);
      expect(isWithinLimits(new Date(2026, 10, 9, 23, 59), min, max)).toBe(false);
      expect(isWithinLimits(new Date(2026, 10, 21, 0, 1), min, max)).toBe(false);
      expect(isWithinLimits(new Date(2026, 10, 15), null, null)).toBe(true);
      expect(isWithinLimits(new Date(2026, 10, 15))).toBe(true);
      expect(isWithinLimits(new Date(2026, 10, 9), min)).toBe(false);
      expect(isWithinLimits(new Date(2026, 10, 21), undefined, max)).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('accepts real dates only', () => {
      expect(isValidDate(new Date(2026, 10, 2))).toBe(true);
      expect(isValidDate(new Date('not a date'))).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
      expect(isValidDate('2026-11-02')).toBe(false);
      expect(isValidDate(1_800_000_000_000)).toBe(false);
    });
  });
});

// The clocks change in March and October (Europe: the last Sundays; the USA: the second Sunday of
// March and the first of November), so some days are 23 or 25 hours long. These run in a zone that
// changes its clock, whatever the zone of the machine is.
describeInTimeZones('calendar date utils across clock changes', () => {
  it('moves one calendar day at a time through two years, never skipping or repeating one', () => {
    for (const year of [2026, 2027]) {
      let day = new Date(year, 0, 1);
      let expected = new Date(Date.UTC(year, 0, 1));
      for (let i = 0; i < 365; i++) {
        expect(parts(day)).toEqual([
          expected.getUTCFullYear(),
          expected.getUTCMonth() + 1,
          expected.getUTCDate(),
        ]);
        expect(day.getHours()).toBe(0);
        day = addDays(day, 1);
        expected = new Date(expected.getTime() + 86_400_000);
      }
    }
  });

  it.each([
    ['Europe, clocks forward 2026', 2026, 2, 28, [29, 30]],
    ['Europe, clocks back 2026', 2026, 9, 24, [25, 26]],
    ['Europe, clocks forward 2027', 2027, 2, 27, [28, 29]],
    ['Europe, clocks back 2027', 2027, 9, 30, [31, 1]],
    ['USA, clocks forward 2026', 2026, 2, 7, [8, 9]],
    ['USA, clocks back 2026', 2026, 9, 31, [1, 2]],
    ['USA, clocks forward 2027', 2027, 2, 13, [14, 15]],
    ['USA, clocks back 2027', 2027, 10, 6, [7, 8]],
  ])(
    '%s: the two days after the start are the next two calendar days',
    (_name, year, month, day, expected) => {
      const start = new Date(year, month, day);
      const first = addDays(start, 1);
      const second = addDays(start, 2);

      expect([first.getDate(), second.getDate()]).toEqual(expected);
      expect(first.getHours()).toBe(0);
      expect(second.getHours()).toBe(0);
      expect(addDays(second, -2).getDate()).toBe(start.getDate());
      expect(addDays(second, -2).getHours()).toBe(0);
    },
  );

  it('goes by weeks and months over a clock change and lands on midnight', () => {
    // 23 March 2026 plus one week is 30 March, the day after the European change
    expect(parts(addDays(new Date(2026, 2, 23), 7))).toEqual([2026, 3, 30]);
    expect(parts(addDays(new Date(2026, 9, 19), 7))).toEqual([2026, 10, 26]);
    expect(parts(addMonths(new Date(2026, 1, 28), 1))).toEqual([2026, 3, 28]);
    expect(parts(addMonths(new Date(2026, 2, 29), 7))).toEqual([2026, 10, 29]);
    expect(parts(addYears(new Date(2026, 9, 25), 1))).toEqual([2027, 10, 25]);
    for (const date of [
      addDays(new Date(2026, 2, 23), 7),
      addMonths(new Date(2026, 2, 29), 7),
      addYears(new Date(2026, 9, 25), 1),
      startOfDay(new Date(2026, 2, 29, 15)),
      startOfMonth(new Date(2026, 2, 29)),
      endOfMonth(new Date(2026, 9, 3)),
      startOfWeek(new Date(2026, 2, 29)),
      endOfWeek(new Date(2026, 9, 25)),
    ]) {
      expect(date.getHours(), String(date)).toBe(0);
    }
  });

  it('finds the week of the day of a change', () => {
    // 29 March and 25 October 2026 and 8 March and 1 November 2026 are Sundays
    expect(parts(startOfWeek(new Date(2026, 2, 29)))).toEqual([2026, 3, 23]);
    expect(parts(endOfWeek(new Date(2026, 2, 29)))).toEqual([2026, 3, 29]);
    expect(parts(startOfWeek(new Date(2026, 2, 30)))).toEqual([2026, 3, 30]);
    expect(parts(endOfWeek(new Date(2026, 9, 24)))).toEqual([2026, 10, 25]);
    expect(parts(startOfWeek(new Date(2026, 10, 1)))).toEqual([2026, 10, 26]);
    expect(parts(endOfWeek(new Date(2026, 2, 8)))).toEqual([2026, 3, 8]);
  });

  it('compares and clamps by calendar day on the days of a change', () => {
    const forward = new Date(2026, 2, 29);
    expect(compareDays(new Date(2026, 2, 30), forward)).toBe(1);
    expect(compareDays(forward, new Date(2026, 2, 28))).toBe(1);
    expect(compareDays(new Date(2026, 2, 29, 23, 59), new Date(2026, 2, 29, 0, 1))).toBe(0);
    expect(sameDay(new Date(2026, 9, 25, 23, 30), new Date(2026, 9, 25))).toBe(true);
    expect(isWithinLimits(forward, forward, forward)).toBe(true);
    expect(isWithinLimits(new Date(2026, 2, 28, 23, 59), forward, null)).toBe(false);
    expect(parts(clampDate(new Date(2026, 2, 28), forward, null))).toEqual([2026, 3, 29]);
    expect(parts(clampDate(new Date(2026, 3, 2), null, forward))).toEqual([2026, 3, 29]);
  });
});
