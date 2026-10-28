import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Helpers for the specs of the UI kit.

const KEY_CODES: Record<string, number> = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ' ': 32,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};

/**
 * Dispatches a keydown like a browser does, with both `key` and the legacy `keyCode`. The CDK
 * (key managers, menu, dialog and overlay Escape handling) reads `keyCode`, so an event with only
 * `key` is silently ignored there and a test written with it passes for the wrong reason.
 */
export function keydown(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', {
    value: KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0),
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Time zones whose clocks change around the days the date specs use, with a day on which they do
 * (year, month 0 to 11, day): Europe on the last Sundays of March and October, the USA on the second
 * Sunday of March and the first of November.
 */
const CLOCK_CHANGE_ZONES: [zone: string, forward: [number, number, number]][] = [
  ['Europe/Berlin', [2026, 2, 29]],
  ['America/New_York', [2026, 2, 8]],
];

/**
 * Runs a block of specs once in each of two time zones that change their clocks, whatever the zone
 * of the machine (CI usually runs in UTC, where no day is 23 or 25 hours long and a date helper
 * that adds 24 hours would pass). The zone is set for the block and put back after it, so build
 * every Date inside the specs (`it`, `beforeEach`), not when the block is collected.
 *
 * The first spec of each block checks that the zone really changes its clock, so the block cannot
 * go on testing nothing if the zone cannot be switched (a browser runner, for example).
 */
export function describeInTimeZones(title: string, body: (zone: string) => void): void {
  describe.each(CLOCK_CHANGE_ZONES)(`${title} (clocks of %s)`, (zone, [year, month, day]) => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    let previous: string | undefined;

    beforeAll(() => {
      previous = env?.['TZ'];
      if (env) {
        env['TZ'] = zone;
      }
    });

    afterAll(() => {
      if (!env) {
        return;
      }
      if (previous === undefined) {
        delete env['TZ'];
      } else {
        env['TZ'] = previous;
      }
    });

    it('runs in a time zone whose clock changes on the days checked', () => {
      const before = new Date(year, month, day - 1, 12).getTimezoneOffset();
      const after = new Date(year, month, day + 1, 12).getTimezoneOffset();

      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      expect(after).not.toBe(before);
      // The day itself is 23 hours long: midnight to midnight
      const hours =
        (new Date(year, month, day + 1).getTime() - new Date(year, month, day).getTime()) / 3.6e6;
      expect(hours).toBe(23);
    });

    body(zone);
  });
}
