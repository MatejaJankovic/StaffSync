import { formatDate } from '@angular/common';

/** The locale the date pickers display and parse dates in (day first: `31/03/2027`). */
export const DATE_LOCALE = 'en-GB';

/** `2026-11-01` → a local-midnight Date, so the date picker doesn't shift it by the time zone. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A Date from the date picker → `2026-11-01`, from its local parts (not `toISOString`, which uses UTC). */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `2026-11-01` → `1 Nov 2026` */
export function shortDate(iso: string): string {
  return formatDate(iso, 'd MMM y', DATE_LOCALE);
}

/**
 * A message from the API as the UI writes things: its ISO dates as `2 Nov 2026` and the seniority
 * levels as `Senior`, e.g. `Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)`
 * → `Insufficient capacity 2 Nov 2026 – 13 Nov 2026 (40% free, 60% required)`. The API keeps ISO
 * dates and enum names, so its messages stay exact for Swagger and the API tests.
 */
export function readableMessage(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => shortDate(iso))
    .replace(/\b(JUNIOR|MEDIOR|SENIOR)\b/g, (level) => level[0] + level.slice(1).toLowerCase());
}

/**
 * Typed text → a Date, read day first: `05/02/2027` is 5 February (`Date.parse` would read it as
 * 2 May). Separators `/`, `.` and `-` are accepted and the year has four digits.
 *
 * Returns `null` for no text, and an Invalid Date (see {@link isValidDate}) for text that is not a
 * date, or a day that does not exist (`31/02/2027`). A Date is returned as it is when valid; any
 * other value that is not a string is an Invalid Date.
 */
export function parseDayFirstDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    if (value === null) {
      return null;
    }
    return isValidDate(value) ? value : new Date(NaN);
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (!match) {
    return new Date(NaN);
  }
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `new Date(2027, 1, 31)` rolls over to March, so a day that doesn't exist is rejected
  const exists =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return exists ? date : new Date(NaN);
}

/** True for a Date that is a real point in time (not `new Date(NaN)`). */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/** A Date → `05/02/2027` (day first, zero-padded, from its local parts). */
export function formatDayFirstDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).padStart(4, '0');
  return `${day}/${month}/${year}`;
}

/**
 * Compares two Dates by calendar day (local), ignoring the time of day: negative when `a` is an
 * earlier day than `b`, 0 on the same day, positive when later. The size is the number of days,
 * and a daylight saving change does not shift it.
 */
export function compareDays(a: Date, b: Date): number {
  // `Date.UTC(50, ...)` means 1950, so the year is set separately (as the calendar does)
  const dayNumber = (date: Date) => {
    const utc = new Date(0);
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return utc.getTime() / 86_400_000;
  };
  return dayNumber(a) - dayNumber(b);
}
