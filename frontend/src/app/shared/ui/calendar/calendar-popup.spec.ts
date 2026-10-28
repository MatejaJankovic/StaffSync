import { OverlayKeyboardDispatcher, OverlayOutsideClickDispatcher } from '@angular/cdk/overlay';
import { Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SsDialog } from '../dialog/dialog';
import { keydown } from '../testing';
import { SsCalendarPeriod } from './calendar';
import { SsCalendarPopup, SsCalendarPopupRef } from './calendar-popup';

@Component({ template: '<button type="button" class="in-dialog">Date</button>' })
class DialogWithToggle {}

describe('SsCalendarPopup', () => {
  let popup: SsCalendarPopup;
  let toggle: HTMLButtonElement;
  const refs: SsCalendarPopupRef[] = [];
  const extras: HTMLElement[] = [];

  // Today is Sunday 15 November 2026, whatever the day the suite runs on
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
    popup = TestBed.inject(SsCalendarPopup);
    toggle = addElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Open calendar';
  });

  afterEach(() => {
    vi.useRealTimers();
    refs.splice(0).forEach((ref) => ref.close());
    extras.splice(0).forEach((element) => element.remove());
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  function addElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    document.body.append(element);
    extras.push(element);
    return element;
  }

  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  function open(config: Partial<Parameters<SsCalendarPopup['open']>[0]> = {}) {
    toggle.focus();
    const ref = popup.open({ origin: toggle, mode: 'single', ...config });
    refs.push(ref);
    return ref;
  }

  const dialog = () =>
    document.querySelector<HTMLElement>('.cdk-overlay-container [role="dialog"]');
  const dialogs = () => document.querySelectorAll('.cdk-overlay-container .ss-calendar-popup');
  const day = (label: string) =>
    document.querySelector<HTMLButtonElement>(`.ss-calendar-popup [aria-label="${label}"]`)!;
  const focusedLabel = () => document.activeElement?.getAttribute('aria-label');

  async function click(label: string) {
    day(label).click();
    await settle();
  }

  describe('opening', () => {
    it('opens a dialog named "Choose a date" holding the calendar', async () => {
      open();
      await settle();

      const popupElement = dialog()!;
      expect(popupElement).not.toBeNull();
      expect(popupElement.getAttribute('aria-label')).toBe('Choose a date');
      expect(popupElement.querySelector('[role="grid"]')).not.toBeNull();
      expect(popupElement.querySelector('.ss-calendar__heading')!.textContent!.trim()).toBe(
        'November 2026',
      );
      expect(popupElement.closest('.cdk-overlay-pane')!.classList).toContain('ss-calendar-overlay');
    });

    it('names a range popup "Choose a period"', async () => {
      open({ mode: 'range' });
      await settle();

      expect(dialog()!.getAttribute('aria-label')).toBe('Choose a period');
    });

    it('uses the name it is given', async () => {
      open({ mode: 'range', ariaLabel: 'Choose the dates of the leave' });
      await settle();

      expect(dialog()!.getAttribute('aria-label')).toBe('Choose the dates of the leave');
    });

    it('takes the origin as an ElementRef too', async () => {
      toggle.focus();
      refs.push(popup.open({ origin: new ElementRef(toggle), mode: 'single' }));
      await settle();

      expect(dialog()).not.toBeNull();
    });

    it('shows the month of the value and marks the value', async () => {
      open({ value: new Date(2027, 2, 9) });
      await settle();

      expect(dialog()!.querySelector('.ss-calendar__heading')!.textContent!.trim()).toBe(
        'March 2027',
      );
      expect(day('9 March 2027').closest('td')!.getAttribute('aria-selected')).toBe('true');
    });

    it('shows the month of startAt', async () => {
      open({ startAt: new Date(2028, 1, 29) });
      await settle();

      expect(day('29 February 2028')).not.toBeNull();
    });

    it('marks the given period in range mode', async () => {
      open({
        mode: 'range',
        range: { start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) },
      });
      await settle();

      expect(day('4 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('5 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('7 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(day('8 November 2026').closest('td')!.getAttribute('aria-selected')).toBe('false');
    });

    it('disables the days outside min and max, and keeps the limit days', async () => {
      open({ min: new Date(2026, 10, 10), max: new Date(2026, 10, 20) });
      await settle();

      expect(day('9 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('10 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('20 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('21 November 2026').getAttribute('aria-disabled')).toBe('true');
    });

    it('does not pick a disabled day', async () => {
      const ref = open({ min: new Date(2026, 10, 10) });
      const picked: Date[] = [];
      ref.dateSelected.subscribe((date) => picked.push(date));
      await settle();
      await click('9 November 2026');

      expect(picked).toEqual([]);
      expect(dialog()).not.toBeNull();
    });
  });

  describe('focus', () => {
    it('moves the focus to today when nothing is selected', async () => {
      open();
      await settle();

      expect(focusedLabel()).toBe('15 November 2026');
      expect(dialog()!.contains(document.activeElement)).toBe(true);
    });

    it('moves the focus to the selected day', async () => {
      open({ value: new Date(2026, 10, 9) });
      await settle();

      expect(focusedLabel()).toBe('9 November 2026');
    });

    it('moves the focus to the start of the period in range mode', async () => {
      open({
        mode: 'range',
        range: { start: new Date(2026, 10, 4), end: new Date(2026, 10, 7) },
      });
      await settle();

      expect(focusedLabel()).toBe('4 November 2026');
    });

    it('moves the focus to a day that can be picked when today is not allowed', async () => {
      open({ min: new Date(2026, 10, 20) });
      await settle();

      expect(focusedLabel()).toBe('20 November 2026');
    });

    it('is already focused when open() returns', () => {
      open();

      expect(focusedLabel()).toBe('15 November 2026');
    });

    it('keeps focus in the popup: Tab past the last control goes to the first, and back', async () => {
      // jsdom has no layout, and the CDK takes an element without a box for hidden
      const geometry = vi
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([{}] as unknown as DOMRectList);
      try {
        open();
        await settle();
        const anchors = document.querySelectorAll<HTMLElement>(
          '.cdk-overlay-container .cdk-focus-trap-anchor',
        );
        expect(anchors).toHaveLength(2);

        anchors[1].focus();
        expect(focusedLabel()).toBe('Previous month');

        anchors[0].focus();
        expect(focusedLabel()).toBe('15 November 2026');
      } finally {
        geometry.mockRestore();
      }
    });
  });

  describe('closing', () => {
    it('closes on Escape and gives the focus back to the toggle', async () => {
      const ref = open();
      const closed = vi.fn();
      ref.closed.subscribe(closed);
      await settle();

      const event = keydown(document.activeElement!, 'Escape');
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
      expect(closed).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('closes on Escape after the focus moved inside the popup', async () => {
      open();
      await settle();
      keydown(document.activeElement!, 'ArrowRight');
      await settle();
      expect(focusedLabel()).toBe('16 November 2026');

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });

    it('does not close on Escape with a modifier key', async () => {
      open();
      await settle();
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'keyCode', { value: 27 });
      document.activeElement!.dispatchEvent(event);
      await settle();

      expect(dialog()).not.toBeNull();
    });

    it('closes on a click outside and gives the focus back to the toggle', async () => {
      const ref = open();
      const closed = vi.fn();
      ref.closed.subscribe(closed);
      await settle();

      document.body.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
      expect(closed).toHaveBeenCalledTimes(1);
    });

    it('closes on a click outside that lands on the page, whose focus is then nowhere', async () => {
      open();
      await settle();
      (document.activeElement as HTMLElement).blur();
      const page = addElement('div');

      page.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });

    it('leaves the focus where the user put it when the click outside was on another field', async () => {
      open();
      await settle();
      const other = addElement('input');

      other.focus();
      other.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(other);
    });

    it('stays open for a click inside it', async () => {
      open();
      await settle();

      dialog()!.querySelector<HTMLElement>('.ss-calendar__heading')!.click();
      day('15 November 2026').parentElement!.click();
      await settle();

      expect(dialog()).not.toBeNull();
    });

    it('stays open for a month button and shows the other month', async () => {
      open();
      await settle();

      dialog()!.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(dialog()!.querySelector('.ss-calendar__heading')!.textContent!.trim()).toBe(
        'December 2026',
      );
    });

    it('closes by close(), also twice, and gives the focus back', async () => {
      const ref = open();
      const closed = vi.fn();
      ref.closed.subscribe(closed);
      await settle();

      ref.close();
      ref.close();
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
      expect(closed).toHaveBeenCalledTimes(1);
    });

    it('lets a late subscriber know that it is closed, and completes the streams', async () => {
      const ref = open();
      const completed = vi.fn();
      ref.dateSelected.subscribe({ complete: completed });
      ref.rangeSelected.subscribe({ complete: completed });
      ref.rangeStarted.subscribe({ complete: completed });
      await settle();
      ref.close();

      const closed = vi.fn();
      ref.closed.subscribe({ next: closed, complete: closed });

      expect(completed).toHaveBeenCalledTimes(3);
      expect(closed).toHaveBeenCalledTimes(2);
    });

    it('leaves nothing behind in the page', async () => {
      open();
      await settle();
      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(document.querySelector('.cdk-overlay-container .ss-calendar')).toBeNull();
      expect(document.querySelector('.cdk-overlay-container .cdk-focus-trap-anchor')).toBeNull();
      expect(document.querySelectorAll('.cdk-overlay-pane')).toHaveLength(0);
    });

    it('stops listening for keys and clicks after it closed', async () => {
      // The dispatchers of the overlay listen on the page for as long as an overlay that wants
      // keys or pointer events is open, and take their listeners off when the last one is closed
      interface Dispatcher {
        _isAttached: boolean;
        _attachedOverlays: unknown[];
      }
      const keys = TestBed.inject(OverlayKeyboardDispatcher) as unknown as Dispatcher;
      const clicks = TestBed.inject(OverlayOutsideClickDispatcher) as unknown as Dispatcher;
      const ref = open();
      await settle();
      expect(keys._isAttached).toBe(true);
      expect(clicks._isAttached).toBe(true);

      ref.close();
      await settle();

      expect(keys._attachedOverlays).toHaveLength(0);
      expect(clicks._attachedOverlays).toHaveLength(0);
      expect(keys._isAttached).toBe(false);
      expect(clicks._isAttached).toBe(false);
    });

    it('does not take the focus back when the toggle is no longer in the page', async () => {
      const ref = open();
      await settle();
      toggle.remove();

      ref.close();
      await settle();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('picking', () => {
    it('closes on the pick of a day in single mode, tells which, and gives the focus back', async () => {
      const ref = open();
      const picked: Date[] = [];
      const closed = vi.fn();
      ref.dateSelected.subscribe((date) => picked.push(date));
      ref.closed.subscribe(closed);
      await settle();

      await click('18 November 2026');

      expect(picked).toHaveLength(1);
      expect([picked[0].getFullYear(), picked[0].getMonth(), picked[0].getDate()]).toEqual([
        2026, 10, 18,
      ]);
      expect(picked[0].getHours()).toBe(0);
      expect(closed).toHaveBeenCalledTimes(1);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });

    it('picks with Enter on the focused day', async () => {
      const ref = open({ value: new Date(2026, 10, 9) });
      const picked: Date[] = [];
      ref.dateSelected.subscribe((date) => picked.push(date));
      await settle();

      keydown(document.activeElement!, 'ArrowRight');
      await settle();
      keydown(document.activeElement!, 'Enter');
      await settle();

      expect(picked.map((date) => date.getDate())).toEqual([10]);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });

    it('calls onSelect with the day, before it closes', async () => {
      let stillOpen: boolean | null = null;
      const onSelect = vi.fn(() => (stillOpen = dialog() !== null));
      open({ onSelect });
      await settle();

      await click('18 November 2026');

      expect(onSelect).toHaveBeenCalledTimes(1);
      const [selection] = onSelect.mock.calls[0] as unknown as [Date];
      expect(selection.getDate()).toBe(18);
      expect(stillOpen).toBe(true);
    });

    it('does not close on the first pick in range mode, and tells the start', async () => {
      const ref = open({ mode: 'range' });
      const starts: Date[] = [];
      const periods: SsCalendarPeriod[] = [];
      const closed = vi.fn();
      ref.rangeStarted.subscribe((date) => starts.push(date));
      ref.rangeSelected.subscribe((period) => periods.push(period));
      ref.closed.subscribe(closed);
      await settle();

      await click('10 November 2026');

      expect(starts.map((date) => date.getDate())).toEqual([10]);
      expect(periods).toEqual([]);
      expect(closed).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it('closes on the second pick in range mode, and tells the period', async () => {
      const onSelect = vi.fn();
      const ref = open({ mode: 'range', onSelect });
      const periods: SsCalendarPeriod[] = [];
      const picked = vi.fn();
      ref.rangeSelected.subscribe((period) => periods.push(period));
      ref.dateSelected.subscribe(picked);
      await settle();

      await click('10 November 2026');
      await click('13 November 2026');

      expect(periods).toHaveLength(1);
      expect([periods[0].start.getDate(), periods[0].end.getDate()]).toEqual([10, 13]);
      expect(periods[0].start.getHours()).toBe(0);
      expect(picked).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(periods[0]);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);
    });

    it('stays open when the second pick is before the start, and takes it as the new start', async () => {
      const ref = open({ mode: 'range' });
      const starts: Date[] = [];
      const periods: SsCalendarPeriod[] = [];
      ref.rangeStarted.subscribe((date) => starts.push(date));
      ref.rangeSelected.subscribe((period) => periods.push(period));
      await settle();

      await click('10 November 2026');
      await click('5 November 2026');

      expect(starts.map((date) => date.getDate())).toEqual([10, 5]);
      expect(periods).toEqual([]);
      expect(dialog()).not.toBeNull();

      await click('6 November 2026');
      expect(periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [5, 6],
      ]);
      expect(dialog()).toBeNull();
    });

    it('closes on a period of one day', async () => {
      const ref = open({ mode: 'range' });
      const periods: SsCalendarPeriod[] = [];
      ref.rangeSelected.subscribe((period) => periods.push(period));
      await settle();

      await click('10 November 2026');
      await click('10 November 2026');

      expect(periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [10, 10],
      ]);
      expect(dialog()).toBeNull();
    });

    it('picks a period with the keyboard', async () => {
      const ref = open({ mode: 'range' });
      const periods: SsCalendarPeriod[] = [];
      ref.rangeSelected.subscribe((period) => periods.push(period));
      await settle();

      keydown(document.activeElement!, ' ');
      await settle();
      expect(dialog()).not.toBeNull();
      keydown(document.activeElement!, 'ArrowDown');
      await settle();
      keydown(document.activeElement!, 'Enter');
      await settle();

      expect(periods.map((period) => [period.start.getDate(), period.end.getDate()])).toEqual([
        [15, 22],
      ]);
      expect(dialog()).toBeNull();
    });

    it('closes after the range was started and Escape is pressed, with no period', async () => {
      const ref = open({ mode: 'range' });
      const periods: SsCalendarPeriod[] = [];
      ref.rangeSelected.subscribe((period) => periods.push(period));
      await settle();
      await click('10 November 2026');

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(dialog()).toBeNull();
      expect(periods).toEqual([]);
    });
  });

  describe('one popup at a time', () => {
    it('closes the open popup when another is opened', async () => {
      const other = addElement('button');
      const first = open();
      const firstClosed = vi.fn();
      first.closed.subscribe(firstClosed);
      await settle();

      other.focus();
      const second = popup.open({ origin: other, mode: 'range' });
      refs.push(second);
      await settle();

      expect(firstClosed).toHaveBeenCalledTimes(1);
      expect(dialogs()).toHaveLength(1);
      expect(dialog()!.getAttribute('aria-label')).toBe('Choose a period');
      expect(dialog()!.contains(document.activeElement)).toBe(true);
    });

    it('opens the same popup again after one was closed', async () => {
      open();
      await settle();
      keydown(document.activeElement!, 'Escape');
      await settle();

      open();
      await settle();

      expect(dialogs()).toHaveLength(1);
    });

    it('gives the focus back to the element that had it when the second popup opened', async () => {
      const other = addElement('button');
      open();
      await settle();

      other.focus();
      const second = popup.open({ origin: other, mode: 'single' });
      refs.push(second);
      await settle();
      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(document.activeElement).toBe(other);
    });

    it('sends the focus of a popup opened from inside another back to where the first one would', async () => {
      const first = open();
      refs.push(first);
      await settle();
      expect(dialog()!.contains(document.activeElement)).toBe(true);

      const second = popup.open({ origin: toggle, mode: 'range' });
      refs.push(second);
      await settle();
      expect(dialogs()).toHaveLength(1);

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(document.activeElement).toBe(toggle);
    });
  });

  describe('the toggle button', () => {
    function wireToggle() {
      const opened: SsCalendarPopupRef[] = [];
      toggle.addEventListener('click', () => {
        const ref = popup.open({ origin: toggle, mode: 'single' });
        refs.push(ref);
        opened.push(ref);
      });
      return opened;
    }

    it('opens on the first click, closes on the second, and opens again on the third', async () => {
      const opened = wireToggle();
      toggle.focus();

      toggle.click();
      await settle();
      expect(dialog()).not.toBeNull();

      toggle.click();
      await settle();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(toggle);

      toggle.click();
      await settle();
      expect(dialog()).not.toBeNull();
      expect(dialogs()).toHaveLength(1);
      expect(opened).toHaveLength(3);
    });

    it('hands the click that closes it an already closed ref', async () => {
      const opened = wireToggle();
      toggle.focus();
      toggle.click();
      await settle();
      toggle.click();
      await settle();

      const closed = vi.fn();
      opened[1].closed.subscribe(closed);
      expect(closed).toHaveBeenCalledTimes(1);
    });

    it('closes the popup of another toggle by a click, and opens its own', async () => {
      const other = addElement('button');
      other.addEventListener('click', () => {
        refs.push(popup.open({ origin: other, mode: 'single' }));
      });
      toggle.addEventListener('click', () => {
        refs.push(popup.open({ origin: toggle, mode: 'single' }));
      });

      toggle.focus();
      toggle.click();
      await settle();
      other.focus();
      other.click();
      await settle();

      expect(dialogs()).toHaveLength(1);
      expect(document.activeElement && dialog()!.contains(document.activeElement)).toBe(true);
    });
  });

  describe('inside a dialog', () => {
    afterEach(() => TestBed.inject(SsDialog).closeAll());

    it('closes on Escape without closing the dialog under it', async () => {
      const dialogRef = TestBed.inject(SsDialog).open(DialogWithToggle, { ariaLabel: 'Request' });
      await settle();
      const opener = document.querySelector<HTMLButtonElement>('.in-dialog')!;
      opener.focus();
      const closedDialog = vi.fn();
      dialogRef.afterClosed().subscribe(closedDialog);

      refs.push(popup.open({ origin: opener, mode: 'single' }));
      await settle();
      expect(document.querySelectorAll('.cdk-overlay-container [role="dialog"]')).toHaveLength(2);

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(dialogs()).toHaveLength(0);
      expect(closedDialog).not.toHaveBeenCalled();
      expect(document.querySelector('.in-dialog')).not.toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it('closes by a click on the dimmed backdrop and leaves the dialog open', async () => {
      const dialogRef = TestBed.inject(SsDialog).open(DialogWithToggle, { ariaLabel: 'Request' });
      await settle();
      const opener = document.querySelector<HTMLButtonElement>('.in-dialog')!;
      opener.focus();
      // The dialog closes on this event: it is what a click on its backdrop would set off
      let backdropClicked = 0;
      dialogRef.backdropClick().subscribe(() => backdropClicked++);

      refs.push(popup.open({ origin: opener, mode: 'single' }));
      await settle();
      // The popup takes the click in the capture phase: it must not go on to the backdrop itself
      const backdrop = document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!;
      let reached = 0;
      backdrop.addEventListener('click', () => reached++);
      backdrop.click();
      await settle();

      const [reachedBackdrop, clickedBackdrop, popups] = [
        reached,
        backdropClicked,
        dialogs().length,
      ];

      expect(popups).toBe(0);
      expect(reachedBackdrop).toBe(0);
      expect(clickedBackdrop).toBe(0);
    });

    it('closes by a click on the dialog and leaves the dialog open', async () => {
      const dialogRef = TestBed.inject(SsDialog).open(DialogWithToggle, { ariaLabel: 'Request' });
      await settle();
      const opener = document.querySelector<HTMLButtonElement>('.in-dialog')!;
      opener.focus();
      const closedDialog = vi.fn();
      dialogRef.afterClosed().subscribe(closedDialog);

      refs.push(popup.open({ origin: opener, mode: 'single' }));
      await settle();
      document.querySelector<HTMLElement>('.cdk-dialog-container')!.click();
      await settle();

      expect(dialogs()).toHaveLength(0);
      expect(closedDialog).not.toHaveBeenCalled();
    });
  });
});
