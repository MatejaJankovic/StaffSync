import { compareDays, formatDayFirstDate, isValidDate, parseDayFirstDate } from '../../dates';
import { describeInTimeZones } from '../testing';

describe('day-first date helpers', () => {
  describe('parseDayFirstDate', () => {
    it('returns a local-midnight Date for dd/MM/yyyy text', () => {
      const date = parseDayFirstDate('05/02/2027')!;

      expect(date.getFullYear()).toBe(2027);
      expect(date.getMonth()).toBe(1);
      expect(date.getDate()).toBe(5);
      expect(date.getHours()).toBe(0);
    });

    it('accepts / . and - and one-digit parts', () => {
      for (const text of ['5/2/2027', '5.2.2027', '5-2-2027', '05-02-2027', '  5/2/2027  ']) {
        expect(parseDayFirstDate(text), text).toEqual(new Date(2027, 1, 5));
      }
    });

    it('is null for empty or blank text', () => {
      expect(parseDayFirstDate('')).toBeNull();
      expect(parseDayFirstDate(' \t ')).toBeNull();
    });

    it('is an Invalid Date for text that is not dd/MM/yyyy', () => {
      for (const text of [
        'tomorrow',
        '2027-03-31',
        '5/2/27',
        '05/02',
        '5/2/2027/1',
        '05_02_2027',
        '12/13/2027',
      ]) {
        expect(isValidDate(parseDayFirstDate(text)), text).toBe(false);
        expect(parseDayFirstDate(text), text).not.toBeNull();
      }
    });

    it('is an Invalid Date for a day that does not exist', () => {
      for (const text of [
        '31/02/2027',
        '29/02/2027',
        '29/02/2100',
        '31/06/2027',
        '0/1/2027',
        '1/0/2027',
      ]) {
        expect(isValidDate(parseDayFirstDate(text)), text).toBe(false);
        expect(parseDayFirstDate(text), text).not.toBeNull();
      }
    });

    it('accepts a leap day only in a leap year', () => {
      expect(parseDayFirstDate('29/02/2028')).toEqual(new Date(2028, 1, 29));
      expect(parseDayFirstDate('29/02/2000')).toEqual(new Date(2000, 1, 29));
      expect(isValidDate(parseDayFirstDate('29/02/2029'))).toBe(false);
    });

    it('takes a value that is not text as it is: a valid Date, null, or otherwise invalid', () => {
      const date = new Date(2027, 1, 5);

      expect(parseDayFirstDate(date)).toBe(date);
      expect(parseDayFirstDate(null)).toBeNull();
      expect(isValidDate(parseDayFirstDate(new Date(NaN)))).toBe(false);
      expect(isValidDate(parseDayFirstDate(42))).toBe(false);
      expect(isValidDate(parseDayFirstDate({}))).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('is true for a real Date only', () => {
      expect(isValidDate(new Date(2027, 1, 5))).toBe(true);
      expect(isValidDate(new Date(NaN))).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
      expect(isValidDate('2027-02-05')).toBe(false);
      expect(isValidDate(1_800_000_000_000)).toBe(false);
    });
  });

  describe('formatDayFirstDate', () => {
    it('writes dd/MM/yyyy, zero-padded', () => {
      expect(formatDayFirstDate(new Date(2027, 0, 5))).toBe('05/01/2027');
      expect(formatDayFirstDate(new Date(2027, 11, 31))).toBe('31/12/2027');
      expect(formatDayFirstDate(new Date(2028, 1, 29))).toBe('29/02/2028');
    });

    it('uses the local day whatever the time of day', () => {
      expect(formatDayFirstDate(new Date(2027, 2, 9, 23, 59, 59))).toBe('09/03/2027');
      expect(formatDayFirstDate(new Date(2027, 2, 9, 0, 0, 0))).toBe('09/03/2027');
    });

    it('round-trips with parseDayFirstDate', () => {
      for (const date of [
        new Date(2026, 10, 2),
        new Date(2028, 1, 29),
        new Date(2027, 2, 28),
        new Date(2027, 9, 31),
        new Date(1999, 11, 31),
      ]) {
        expect(parseDayFirstDate(formatDayFirstDate(date))).toEqual(date);
      }
    });
  });

  describe('compareDays', () => {
    it('is 0 for the same day, whatever the time', () => {
      expect(compareDays(new Date(2027, 2, 15, 0, 0), new Date(2027, 2, 15, 23, 59, 59))).toBe(0);
    });

    it('is negative for an earlier day and positive for a later one, by the number of days', () => {
      expect(compareDays(new Date(2027, 2, 14, 23, 59), new Date(2027, 2, 15, 0, 1))).toBe(-1);
      expect(compareDays(new Date(2027, 2, 16), new Date(2027, 2, 15))).toBe(1);
      expect(compareDays(new Date(2027, 2, 25), new Date(2027, 2, 15))).toBe(10);
    });

    it('counts a month end, a leap day and a year end as one day each', () => {
      expect(compareDays(new Date(2027, 2, 1), new Date(2027, 1, 28))).toBe(1);
      expect(compareDays(new Date(2028, 2, 1), new Date(2028, 1, 29))).toBe(1);
      expect(compareDays(new Date(2028, 1, 29), new Date(2028, 1, 28))).toBe(1);
      expect(compareDays(new Date(2028, 0, 1), new Date(2027, 11, 31))).toBe(1);
      expect(compareDays(new Date(2028, 0, 1), new Date(2027, 0, 1))).toBe(365);
      expect(compareDays(new Date(2029, 0, 1), new Date(2028, 0, 1))).toBe(366);
    });

    describeInTimeZones('compareDays', () => {
      it('is not shifted by a daylight saving change (a 23 or 25 hour day)', () => {
        for (const [month, day] of [
          [2, 13],
          [2, 14],
          [2, 27],
          [2, 28],
          [9, 30],
          [9, 31],
          [10, 6],
          [10, 7],
        ]) {
          const before = new Date(2027, month, day - 1, 23, 30);
          const start = new Date(2027, month, day);
          const next = new Date(2027, month, day + 1, 0, 30);
          expect(compareDays(start, before), `${month}/${day}`).toBe(1);
          expect(compareDays(next, start), `${month}/${day}`).toBe(1);
          expect(compareDays(start, next), `${month}/${day}`).toBe(-1);
        }
      });
    });
  });
});
