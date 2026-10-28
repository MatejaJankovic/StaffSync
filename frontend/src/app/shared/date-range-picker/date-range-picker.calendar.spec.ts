import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { DateRangePicker, DateRangeValue } from './date-range-picker';

@Component({
  imports: [ReactiveFormsModule, DateRangePicker],
  template: `
    <button type="button" class="before">Before</button>
    <app-date-range-picker
      [formControl]="period"
      label="Period"
      [required]="required()"
      [min]="min()"
      [max]="max()"
    />
    <button type="button" class="after">After</button>
  `,
})
class Host {
  readonly period = new FormControl<DateRangeValue>(
    { start: null, end: null },
    { nonNullable: true },
  );
  readonly required = signal(true);
  readonly min = signal<Date | null>(new Date(2026, 10, 1));
  readonly max = signal<Date | null>(new Date(2027, 2, 31));
}

/** The calendar popup, the toggle button and the ordering rule of the date range picker. */
describe('DateRangePicker calendar', () => {
  let fixture: ComponentFixture<Host>;

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    // Attached, so that focus and the overlay behave as in the browser
    document.body.appendChild(fixture.nativeElement);
    await settle();
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  // Today is Sunday 15 November 2026, whatever the day the suite runs on: the calendar opens on
  // today's month, and the limits of the host are 1 November 2026 to 31 March 2027
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture?.destroy();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const host = () => fixture.debugElement.nativeElement.querySelector('app-date-range-picker')!;
  const period = () => fixture.componentInstance.period;
  const inputs = () => [...el().querySelectorAll<HTMLInputElement>('input')];
  const toggle = () => el().querySelector<HTMLButtonElement>('button[aria-label="Choose period"]')!;
  const popup = () => document.querySelector<HTMLElement>('.cdk-overlay-container [role="dialog"]');
  const message = () => el().querySelector('[role="alert"]')?.textContent?.trim() ?? '';

  async function type(input: HTMLInputElement, text: string): Promise<void> {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function pick(label: string): Promise<void> {
    const day = document.querySelector<HTMLButtonElement>(
      `.cdk-overlay-container .ss-calendar__day[aria-label="${label}"]`,
    );
    expect(day, `day ${label}`).not.toBeNull();
    day!.click();
    await settle();
  }

  async function openCalendar(): Promise<void> {
    toggle().focus();
    toggle().click();
    await settle();
  }

  function pressEscape(): void {
    // The overlay listens on the body, so the key goes to the element that has the focus
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
  }

  function focusOut(from: HTMLElement, to: HTMLElement | null): void {
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
  }

  describe('the field', () => {
    it('is a labelled group with the label above the box', async () => {
      await render();

      const group = host() as HTMLElement;
      expect(group.getAttribute('role')).toBe('group');
      const label = el().querySelector('label')!;
      expect(group.getAttribute('aria-labelledby')).toBe(label.id);
      expect(label.textContent).toContain('Period');
      expect(group.querySelector('.ss-field__box')).not.toBeNull();
    });

    it('names the two inputs and keeps their placeholders', async () => {
      await render();

      expect(inputs().map((input) => input.getAttribute('aria-label'))).toEqual([
        'Start date',
        'End date',
      ]);
      expect(inputs().map((input) => input.placeholder)).toEqual(['Start date', 'End date']);
    });

    it('marks a required period with a star hidden from screen readers', async () => {
      await render();
      expect(el().querySelector('.ss-field__required')?.getAttribute('aria-hidden')).toBe('true');

      fixture.componentInstance.required.set(false);
      await settle();

      expect(el().querySelector('.ss-field__required')).toBeNull();
    });

    it('has a toggle button that tells it opens a dialog', async () => {
      await render();

      expect(toggle().getAttribute('aria-haspopup')).toBe('dialog');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('turns the box red with the message and not before', async () => {
      await render();
      expect(host().classList).not.toContain('ss-field--invalid');

      period().markAsTouched();
      await settle();

      expect(host().classList).toContain('ss-field--invalid');
    });

    it('shows the focus ring on the field while focus is inside it', async () => {
      await render();
      inputs()[0].focus();
      await settle();
      expect(host().classList).toContain('ss-field--focused');

      focusOut(inputs()[0], null);
      await settle();

      expect(host().classList).not.toContain('ss-field--focused');
    });

    it('is disabled with the form control, toggle button included', async () => {
      await render();

      period().disable();
      await settle();

      expect(toggle().disabled).toBe(true);
      expect(host().classList).toContain('ss-field--disabled');
    });
  });

  describe('touched', () => {
    it('is not set when focus moves from the start date to the end date', async () => {
      await render();

      focusOut(inputs()[0], inputs()[1]);

      expect(period().touched).toBe(false);
    });

    it('is set when focus leaves the whole field', async () => {
      await render();

      focusOut(inputs()[1], el().querySelector('.after'));

      expect(period().touched).toBe(true);
    });

    it('is set when focus moves from the toggle button to the page', async () => {
      await render();

      focusOut(toggle(), el().querySelector('.after'));

      expect(period().touched).toBe(true);
    });

    it('is not set while the calendar has the focus, but when it closes away from the field', async () => {
      await render();
      await openCalendar();
      expect(popup()).not.toBeNull();

      focusOut(toggle(), document.querySelector('.ss-calendar__day'));
      expect(period().touched).toBe(false);

      // a click on another control closes the popup and the focus stays on that control
      const after = el().querySelector<HTMLButtonElement>('.after')!;
      after.focus();
      after.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      after.click();
      await settle();

      expect(popup()).toBeNull();
      expect(period().touched).toBe(true);
    });

    it('is not set when the calendar closes with the focus back on the toggle', async () => {
      await render();
      await openCalendar();

      pressEscape();
      await settle();

      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(toggle());
      expect(period().touched).toBe(false);
    });
  });

  describe('the calendar', () => {
    it('opens in range mode from the toggle button, named for screen readers', async () => {
      await render();

      await openCalendar();

      expect(popup()!.getAttribute('aria-label')).toBe('Choose a period');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('closes with a second click on the toggle button', async () => {
      await render();
      await openCalendar();

      toggle().click();
      await settle();

      expect(popup()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes with Escape and gives the focus back to the toggle button', async () => {
      await render();
      await openCalendar();

      pressEscape();
      await settle();

      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('shows the month of the minimum when today is outside the limits', async () => {
      await render();
      vi.setSystemTime(new Date(2025, 0, 15));
      try {
        await openCalendar();
      } finally {
        vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
      }

      expect(popup()!.querySelector('.ss-calendar__heading')!.textContent!.trim()).toContain(
        'November 2026',
      );
    });

    it('fills the start with the first pick and the end with the second, then closes', async () => {
      await render();
      await openCalendar();

      await pick('2 November 2026');
      expect(inputs()[0].value).toBe('02/11/2026');
      expect(inputs()[1].value).toBe('');
      expect(popup()).not.toBeNull();

      await pick('20 November 2026');

      expect(inputs()[1].value).toBe('20/11/2026');
      expect(period().value.start).toEqual(new Date(2026, 10, 2));
      expect(period().value.end).toEqual(new Date(2026, 10, 20));
      expect(period().valid).toBe(true);
      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(toggle());
    });

    it('lets a second pick before the start restart the period from that day', async () => {
      await render();
      await openCalendar();

      await pick('10 November 2026');
      await pick('3 November 2026');
      expect(popup()).not.toBeNull();
      expect(inputs()[0].value).toBe('03/11/2026');
      expect(inputs()[1].value).toBe('');

      await pick('5 November 2026');

      expect(period().value).toEqual({
        start: new Date(2026, 10, 3),
        end: new Date(2026, 10, 5),
      });
    });

    it('lets one day be the whole period', async () => {
      await render();
      await openCalendar();

      await pick('10 November 2026');
      await pick('10 November 2026');

      expect(period().value).toEqual({
        start: new Date(2026, 10, 10),
        end: new Date(2026, 10, 10),
      });
      expect(period().valid).toBe(true);
    });

    it('clears an end that was there when a new start is picked', async () => {
      await render();
      period().setValue({ start: new Date(2026, 10, 2), end: new Date(2027, 0, 31) });
      await settle();
      await openCalendar();

      await pick('10 November 2026');

      expect(period().value).toEqual({ start: new Date(2026, 10, 10), end: null });
      expect(inputs()[1].value).toBe('');
    });

    it('marks the typed period in the calendar', async () => {
      await render();
      await type(inputs()[0], '02/11/2026');
      await type(inputs()[1], '05/11/2026');

      await openCalendar();

      const labelsOf = (selector: string) =>
        [...popup()!.querySelectorAll(selector)].map((cell) =>
          cell.querySelector('button')!.getAttribute('aria-label'),
        );
      expect(labelsOf('[role="gridcell"][aria-selected="true"]')).toEqual([
        '2 November 2026',
        '3 November 2026',
        '4 November 2026',
        '5 November 2026',
      ]);
      expect(labelsOf('.ss-calendar__cell--start')).toEqual(['2 November 2026']);
      expect(labelsOf('.ss-calendar__cell--end')).toEqual(['5 November 2026']);
      expect(labelsOf('.ss-calendar__cell--range')).toEqual(['3 November 2026', '4 November 2026']);
    });

    it('does not let a day outside the limits be picked', async () => {
      await render();
      await openCalendar();

      const before = document.querySelector<HTMLButtonElement>(
        '.ss-calendar__day[aria-label="31 October 2026"]',
      );
      // the first month shown is November: October 31 is not a cell of it
      expect(before).toBeNull();
      const prev = popup()!.querySelector('[aria-label="Previous month"]')!;
      expect(prev.getAttribute('aria-disabled')).toBe('true');
    });

    it('ignores a click on a day outside the limits and stays open', async () => {
      await render();
      // inside the month shown: 5 to 25 November 2026
      fixture.componentInstance.min.set(new Date(2026, 10, 5));
      fixture.componentInstance.max.set(new Date(2026, 10, 25));
      await settle();
      await openCalendar();

      for (const label of ['4 November 2026', '26 November 2026']) {
        const day = document.querySelector<HTMLButtonElement>(
          `.cdk-overlay-container .ss-calendar__day[aria-label="${label}"]`,
        )!;
        expect(day.getAttribute('aria-disabled'), label).toBe('true');
        day.click();
        await settle();
      }

      expect(inputs().map((input) => input.value)).toEqual(['', '']);
      expect(period().value).toEqual({ start: null, end: null });
      expect(popup()).not.toBeNull();

      // and the first day of the limits is still there to pick
      await pick('5 November 2026');
      expect(inputs()[0].value).toBe('05/11/2026');
    });

    it('does not open with the toggle button disabled', async () => {
      await render();
      period().disable();
      await settle();

      toggle().click();
      await settle();

      expect(toggle().disabled).toBe(true);
      expect(popup()).toBeNull();
    });

    it('does not open when it is asked to by code while disabled', async () => {
      await render();
      period().disable();
      await settle();
      const picker = fixture.debugElement.query(By.directive(DateRangePicker))
        .componentInstance as unknown as { openCalendar(): void };

      picker.openCalendar();
      await settle();

      expect(popup()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('puts the focus on the toggle button before it opens, when a click did not', async () => {
      // Safari does not focus a button that is clicked: the focus is on the page
      await render();
      (document.activeElement as HTMLElement | null)?.blur();
      expect(el().contains(document.activeElement)).toBe(false);

      toggle().click();
      await settle();
      expect(popup()).not.toBeNull();
      expect(period().touched).toBe(false);

      pressEscape();
      await settle();

      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(toggle());
      expect(period().touched).toBe(false);
    });

    it('closes when the picker is destroyed', async () => {
      await render();
      await openCalendar();

      fixture.destroy();

      expect(popup()).toBeNull();
    });

    it('is not touched by a pick, only by leaving the field afterwards', async () => {
      await render();
      await openCalendar();
      await pick('2 November 2026');
      await pick('4 November 2026');

      expect(period().touched).toBe(false);

      focusOut(toggle(), el().querySelector('.after'));
      expect(period().touched).toBe(true);
    });
  });

  describe('the order of the dates', () => {
    it('flags the start on the start control and the end on the end control, merged on the outer one', async () => {
      await render();

      await type(inputs()[0], '10/12/2026');
      await type(inputs()[1], '09/12/2026');

      expect(period().errors).toMatchObject({
        startDateInvalid: expect.anything(),
        endDateInvalid: expect.anything(),
      });
    });

    it('is valid again when the end is fixed', async () => {
      await render();
      await type(inputs()[0], '10/12/2026');
      await type(inputs()[1], '09/12/2026');
      expect(period().invalid).toBe(true);

      await type(inputs()[1], '11/12/2026');

      expect(period().valid).toBe(true);
    });

    it('is valid again when the start is fixed', async () => {
      await render();
      await type(inputs()[0], '10/12/2026');
      await type(inputs()[1], '09/12/2026');

      await type(inputs()[0], '08/12/2026');

      expect(period().valid).toBe(true);
    });

    it('checks the order of a value that is set from code', async () => {
      await render();

      period().setValue({ start: new Date(2026, 11, 10), end: new Date(2026, 11, 9) });
      await settle();

      expect(period().hasError('startDateInvalid')).toBe(true);
      expect(period().hasError('endDateInvalid')).toBe(true);
    });

    it('compares whole days, so the same day with different times is valid', async () => {
      await render();

      period().setValue({
        start: new Date(2026, 11, 10, 18, 30),
        end: new Date(2026, 11, 10, 8, 0),
      });
      await settle();

      expect(period().valid).toBe(true);
    });

    it('ignores the order while one of the texts is not a date', async () => {
      await render();

      await type(inputs()[0], '10/12/2026');
      await type(inputs()[1], '31/02/2027');
      await touchAndSettle();

      expect(period().hasError('dateParse')).toBe(true);
      expect(period().hasError('endDateInvalid')).toBe(false);
      expect(message()).toBe('Enter valid dates');
    });
  });

  async function touchAndSettle(): Promise<void> {
    period().markAsTouched();
    await settle();
  }

  describe('the limits of the inner inputs', () => {
    it('shows the limit error of an end typed in the end input', async () => {
      await render();

      await type(inputs()[0], '02/11/2026');
      await type(inputs()[1], '01/04/2027');
      await touchAndSettle();

      expect(period().hasError('dateMax')).toBe(true);
      expect(message()).toBe('Dates must be between 01/11/2026 and 31/03/2027');
    });

    it('checks a value set from code against the limits', async () => {
      await render();

      period().setValue({ start: new Date(2026, 9, 31), end: new Date(2026, 10, 5) });
      await settle();
      await settle();

      expect(period().hasError('dateMin')).toBe(true);
    });

    it('points the inputs to the message when it shows', async () => {
      await render();
      await touchAndSettle();

      const id = el().querySelector('[role="alert"]')!.id;
      expect(inputs().every((input) => input.getAttribute('aria-describedby') === id)).toBe(true);
      expect(inputs().every((input) => input.getAttribute('aria-invalid') === 'true')).toBe(true);
    });
  });
});
