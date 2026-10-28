import { isValidDate, parseDayFirstDate, parseIsoDate, shortDate, toIsoDate } from './dates';

describe('dates', () => {
  it('round-trip an ISO date without a time zone shift', () => {
    expect(toIsoDate(parseIsoDate('2026-11-01'))).toBe('2026-11-01');
    expect(toIsoDate(parseIsoDate('2027-01-01'))).toBe('2027-01-01');
    expect(toIsoDate(new Date(2026, 2, 9, 23, 59))).toBe('2026-03-09');
  });

  it('shows a short date', () => {
    expect(shortDate('2026-11-01')).toBe('1 Nov 2026');
  });

  describe('parseDayFirstDate', () => {
    it('reads a typed date as day/month/year', () => {
      expect(toIsoDate(parseDayFirstDate('05/02/2027')!)).toBe('2027-02-05');
      expect(toIsoDate(parseDayFirstDate('31/03/2027')!)).toBe('2027-03-31');
      expect(toIsoDate(parseDayFirstDate(' 1.4.2027 ')!)).toBe('2027-04-01');
    });

    it('rejects text that is not a date, or a day that does not exist', () => {
      for (const text of ['tomorrow', '2027-03-31', '31/02/2027', '12/13/2027']) {
        expect(isValidDate(parseDayFirstDate(text)), text).toBe(false);
      }
    });

    it('treats an empty value as no date', () => {
      expect(parseDayFirstDate('  ')).toBeNull();
    });
  });
});
