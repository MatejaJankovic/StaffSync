// Pure date helpers for the calendar. Every date is a local-midnight Date and every calculation
// goes through the calendar parts (year, month, day), never through milliseconds: a day is not
// always 24 hours long (the clocks change in March and October), and `date.getTime() + 86_400_000`
// would skip or repeat a day around the change.

import { compareDays, isValidDate } from '../../dates';

// One copy of these two lives in shared/dates.ts (the date pickers' text helpers use it too)
export { compareDays, isValidDate };

/** A Date from calendar parts. `new Date(27, ...)` means 1927, so the year is set separately. */
function makeDate(year: number, month: number, day: number): Date {
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month, day);
  return date;
}

/** The same calendar day at local midnight (drops the time of day). */
export function startOfDay(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The date `days` calendar days later (earlier when negative), at local midnight. */
export function addDays(date: Date, days: number): Date {
  return makeDate(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** How many days `month` (0 to 11) of `year` has: 28 or 29 (leap years), 30 or 31. */
export function daysInMonth(year: number, month: number): number {
  return makeDate(year, month + 1, 0).getDate();
}

/**
 * The date `months` months later, on the same day of the month, or on the last day of the month
 * when it has no such day: 31 January plus one month is 28 February (29 in a leap year), not 3 March.
 */
export function addMonths(date: Date, months: number): Date {
  const total = date.getFullYear() * 12 + date.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return makeDate(year, month, Math.min(date.getDate(), daysInMonth(year, month)));
}

/** Twelve months later; 29 February plus one year is 28 February. */
export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

/** The first day of the month of `date`. */
export function startOfMonth(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth(), 1);
}

/** The last day of the month of `date`. */
export function endOfMonth(date: Date): Date {
  return makeDate(date.getFullYear(), date.getMonth() + 1, 0);
}

/** The Monday of the week of `date` (weeks start on Monday, as in en-GB). */
export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** The Sunday of the week of `date`. */
export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

/** Whether both are dates on the same calendar day. A `null` is never the same day as anything. */
export function sameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return !!a && !!b && compareDays(a, b) === 0;
}

/** `date` moved into `min` to `max` (either may be missing); the result is at local midnight. */
export function clampDate(date: Date, min?: Date | null, max?: Date | null): Date {
  if (min && compareDays(date, min) < 0) {
    return startOfDay(min);
  }
  if (max && compareDays(date, max) > 0) {
    return startOfDay(max);
  }
  return startOfDay(date);
}

/** Whether `date` lies within `min` to `max`, both ends included. Either may be missing. */
export function isWithinLimits(date: Date, min?: Date | null, max?: Date | null): boolean {
  return !(min && compareDays(date, min) < 0) && !(max && compareDays(date, max) > 0);
}
