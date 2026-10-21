import { formatDate } from '@angular/common';
import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MAT_NATIVE_DATE_FORMATS,
  NativeDateAdapter,
} from '@angular/material/core';

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
 * `NativeDateAdapter.parse` hands a typed string to `Date.parse`, which reads `05/02/2027` as
 * 2 May whatever the locale. This reads typed dates as day/month/year, to match what is displayed.
 */
@Injectable()
export class DayFirstDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value !== 'string') {
      return super.parse(value);
    }
    const text = value.trim();
    if (!text) {
      return null;
    }
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (!match) {
      return this.invalid();
    }
    const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    // `new Date(2027, 1, 31)` rolls over to March, so a day that doesn't exist is rejected
    const exists =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return exists ? date : this.invalid();
  }
}

/** Providers for a component with date pickers: `dd/MM/yyyy` for display and for typing. */
export function provideDayFirstDates(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: DATE_LOCALE },
    { provide: DateAdapter, useClass: DayFirstDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
  ];
}
