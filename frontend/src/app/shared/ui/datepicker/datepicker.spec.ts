import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { toIsoDate } from '../../dates';
import { SsError, SsField, SsLabel } from '../field/field';
import { describeInTimeZones, keydown } from '../testing';
import { SsDatepicker } from './datepicker';

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsError, SsDatepicker],
  template: `
    <button type="button" class="before">Before</button>
    <ss-field>
      <ss-label>Start date</ss-label>
      <ss-datepicker [formControl]="control" [min]="min()" [max]="max()" />
      @if (control.hasError('dateParse')) {
        <ss-error>Enter a valid date</ss-error>
      } @else if (control.hasError('required')) {
        <ss-error>Start date is required</ss-error>
      } @else if (control.hasError('dateMin')) {
        <ss-error>Too early</ss-error>
      } @else if (control.hasError('dateMax')) {
        <ss-error>Too late</ss-error>
      }
    </ss-field>
    <button type="button" class="after">After</button>
  `,
})
class Host {
  readonly control = new FormControl<Date | null>(null, Validators.required);
  readonly min = signal<Date | null>(null);
  readonly max = signal<Date | null>(null);
}

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsDatepicker],
  template: `
    <form [formGroup]="form">
      <ss-field>
        <ss-label>Due</ss-label>
        <ss-datepicker formControlName="due" />
      </ss-field>
    </form>
  `,
})
class GroupHost {
  readonly form = new FormGroup({ due: new FormControl<Date | null>(null) });
}

@Component({
  imports: [SsDatepicker],
  template: `<ss-datepicker ariaLabel="Birthday" id="birthday" />`,
})
class BareHost {}

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsDatepicker],
  template: `
    <ss-field>
      <ss-label>Start date</ss-label>
      <ss-datepicker [formControl]="control" [errorStateMatcher]="matcher" />
    </ss-field>
  `,
})
class MatcherHost {
  readonly control = new FormControl<Date | null>(null);
  readonly matcher = { isErrorState: () => true };
}

describe('SsDatepicker', () => {
  let fixture: ComponentFixture<Host>;
  let control: FormControl<Date | null>;

  // Today is Sunday 15 November 2026, whatever the day the suite runs on
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  function render(setup?: (host: Host) => void) {
    fixture = TestBed.createComponent(Host);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    control = fixture.componentInstance.control;
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const input = () => root().querySelector<HTMLInputElement>('input')!;
  const toggle = () => root().querySelector<HTMLButtonElement>('button.ss-datepicker__toggle')!;
  const field = () => root().querySelector<HTMLElement>('ss-field')!;
  const calendar = () =>
    document.querySelector<HTMLElement>('.cdk-overlay-container [role="dialog"]');
  const day = (label: string) =>
    document.querySelector<HTMLButtonElement>(`.ss-calendar-popup [aria-label="${label}"]`)!;
  const errorText = () => root().querySelector('ss-error')?.textContent?.trim() ?? null;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function type(text: string) {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Focus moving between two elements, as a browser reports it. */
  function focusOn(target: HTMLElement) {
    target.focus();
    fixture.detectChanges();
  }

  async function openCalendar() {
    toggle().click();
    await settle();
  }

  describe('value', () => {
    it('shows a date given by the form as dd/MM/yyyy', () => {
      render((host) => host.control.setValue(new Date(2027, 2, 5)));

      expect(input().value).toBe('05/03/2027');
    });

    it('is empty for no date', () => {
      render();

      expect(input().value).toBe('');
    });

    it('shows a date set later, and clears when the form is reset', () => {
      render();

      control.setValue(new Date(2026, 11, 24));
      expect(input().value).toBe('24/12/2026');

      control.reset();
      expect(input().value).toBe('');
      expect(control.value).toBeNull();
    });

    it('reads typed text day first into a local-midnight Date', () => {
      render();

      type('05/02/2027');

      expect(toIsoDate(control.value!)).toBe('2027-02-05');
      expect(control.value!.getHours()).toBe(0);
    });

    it('accepts the separators . and -', () => {
      render();

      type('5.2.2027');
      expect(toIsoDate(control.value!)).toBe('2027-02-05');

      type('05-02-2027');
      expect(toIsoDate(control.value!)).toBe('2027-02-05');
    });

    it('tidies the text to dd/MM/yyyy when the input loses focus', () => {
      render();
      type('5.2.2027');

      input().dispatchEvent(new Event('blur'));

      expect(input().value).toBe('05/02/2027');
    });

    it('gives null when the text is cleared', () => {
      render((host) => host.control.setValue(new Date(2027, 2, 5)));

      type('');

      expect(control.value).toBeNull();
      expect(control.hasError('required')).toBe(true);
      expect(control.hasError('dateParse')).toBe(false);
    });

    it('does not offer a placeholder unless it is asked for', () => {
      render();

      expect(input().placeholder).toBe('');
    });
  });

  describe('errors on the outer control', () => {
    it('sets dateParse and a null value for text that is not a date', () => {
      render();

      type('tomorrow');

      expect(control.value).toBeNull();
      expect(control.hasError('dateParse')).toBe(true);
      expect(control.errors?.['dateParse']).toEqual({ text: 'tomorrow' });
      expect(input().value).toBe('tomorrow');
    });

    it('treats a day that does not exist as invalid', () => {
      render();

      type('31/02/2027');

      expect(control.hasError('dateParse')).toBe(true);
    });

    it('keeps the wrong text as typed on blur', () => {
      render();
      type('31/02/2027');

      input().dispatchEvent(new Event('blur'));

      expect(input().value).toBe('31/02/2027');
    });

    it('lets the parse error go once a date is typed', () => {
      render();
      type('tomorrow');

      type('06/02/2027');

      expect(control.hasError('dateParse')).toBe(false);
      expect(toIsoDate(control.value!)).toBe('2027-02-06');
    });

    it('clears a parse error when the form writes a value', () => {
      render();
      type('tomorrow');

      control.setValue(new Date(2027, 0, 4));

      expect(input().value).toBe('04/01/2027');
      expect(control.hasError('dateParse')).toBe(false);
    });

    it('sets dateMin below the minimum and accepts the minimum itself', () => {
      render((host) => host.min.set(new Date(2027, 0, 10)));

      type('09/01/2027');
      expect(control.hasError('dateMin')).toBe(true);

      type('10/01/2027');
      expect(control.errors).toBeNull();

      type('11/01/2027');
      expect(control.errors).toBeNull();
    });

    it('sets dateMax above the maximum and accepts the maximum itself', () => {
      render((host) => host.max.set(new Date(2027, 0, 10)));

      type('11/01/2027');
      expect(control.hasError('dateMax')).toBe(true);

      type('10/01/2027');
      expect(control.errors).toBeNull();
    });

    it('compares whole days, ignoring the time of day', () => {
      render((host) => {
        host.min.set(new Date(2027, 0, 10, 18, 0));
        host.max.set(new Date(2027, 0, 10, 6, 0));
      });

      control.setValue(new Date(2027, 0, 10, 12, 0));

      expect(control.errors).toBeNull();
    });

    it('validates a value the form was given before the view existed', () => {
      render((host) => {
        host.min.set(new Date(2027, 0, 10));
        host.control.setValue(new Date(2027, 0, 1));
      });

      expect(control.hasError('dateMin')).toBe(true);
    });

    it('reports required for an empty control', () => {
      render();

      expect(control.hasError('required')).toBe(true);
    });

    it('validates again when the limits change', async () => {
      render((host) => host.control.setValue(new Date(2027, 0, 5)));
      expect(control.errors).toBeNull();

      fixture.componentInstance.min.set(new Date(2027, 0, 10));
      await settle();
      expect(control.hasError('dateMin')).toBe(true);

      fixture.componentInstance.min.set(null);
      fixture.componentInstance.max.set(new Date(2027, 0, 1));
      await settle();
      expect(control.hasError('dateMin')).toBe(false);
      expect(control.hasError('dateMax')).toBe(true);

      fixture.componentInstance.max.set(null);
      await settle();
      expect(control.errors).toBeNull();
    });

    it('gives only the parse error besides required when the text is wrong', () => {
      render((host) => host.min.set(new Date(2027, 0, 10)));

      type('99/99/2027');

      expect(Object.keys(control.errors ?? {}).sort()).toEqual(['dateParse', 'required']);
    });
  });

  describe('inside an ss-field', () => {
    it('points the label at the text input', () => {
      render();

      const label = root().querySelector('label')!;
      expect(label.getAttribute('for')).toBe(input().id);
      expect(input().id).not.toBe('');
    });

    it('moves focus to the input when the label is clicked', () => {
      render();

      root().querySelector<HTMLElement>('ss-label')!.click();

      expect(document.activeElement).toBe(input());
    });

    it('gives the label its required marker', () => {
      render();

      expect(root().querySelector('.ss-field__required')).not.toBeNull();
      expect(input().getAttribute('aria-required')).toBe('true');
    });

    it('has no required marker for a control that is not required', () => {
      const group = TestBed.createComponent(GroupHost);
      group.detectChanges();

      expect(group.nativeElement.querySelector('.ss-field__required')).toBeNull();
      expect(group.nativeElement.querySelector('input').getAttribute('aria-required')).toBe(
        'false',
      );
    });

    it('describes the input by the message area of the field', () => {
      render();

      const sub = root().querySelector('.ss-field__sub')!;
      expect(input().getAttribute('aria-describedby')).toBe(sub.id);
    });

    it('works with formControlName in a form group', () => {
      const group = TestBed.createComponent(GroupHost);
      group.detectChanges();
      const text = group.nativeElement.querySelector('input') as HTMLInputElement;

      text.value = '05/02/2027';
      text.dispatchEvent(new Event('input'));

      expect(toIsoDate(group.componentInstance.form.controls.due.value!)).toBe('2027-02-05');
      group.componentInstance.form.controls.due.setValue(new Date(2027, 2, 1));
      expect(text.value).toBe('01/03/2027');
    });

    it('shows the focus ring state of the field while the input or the button has focus', () => {
      render();
      expect(field().classList).not.toContain('ss-field--focused');

      focusOn(input());
      expect(field().classList).toContain('ss-field--focused');

      focusOn(toggle());
      fixture.detectChanges();
      expect(field().classList).toContain('ss-field--focused');

      focusOn(root().querySelector<HTMLElement>('.after')!);
      fixture.detectChanges();
      expect(field().classList).not.toContain('ss-field--focused');
    });
  });

  describe('error state', () => {
    it('shows no error before the control is touched', () => {
      render();
      type('tomorrow');

      expect(field().classList).not.toContain('ss-field--invalid');
      expect(input().getAttribute('aria-invalid')).toBe('false');
    });

    it('shows the error and marks the input invalid once the control is touched', () => {
      render();
      type('tomorrow');

      control.markAsTouched();
      fixture.detectChanges();

      expect(field().classList).toContain('ss-field--invalid');
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(errorText()).toBe('Enter a valid date');
    });

    it('shows required once touched', () => {
      render();

      control.markAsTouched();
      fixture.detectChanges();

      expect(errorText()).toBe('Start date is required');
    });

    it('shows the error when the form is submitted', () => {
      const group = TestBed.createComponent(GroupHost);
      group.componentInstance.form.controls.due.setValidators(Validators.required);
      group.componentInstance.form.controls.due.updateValueAndValidity();
      group.detectChanges();
      const form = group.nativeElement.querySelector('form') as HTMLFormElement;
      expect(group.nativeElement.querySelector('ss-field').classList).not.toContain(
        'ss-field--invalid',
      );

      form.dispatchEvent(new Event('submit'));
      group.detectChanges();

      expect(group.nativeElement.querySelector('ss-field').classList).toContain(
        'ss-field--invalid',
      );
    });

    it('follows a custom error state matcher', () => {
      const matcherFixture = TestBed.createComponent(MatcherHost);
      matcherFixture.detectChanges();

      expect(matcherFixture.nativeElement.querySelector('ss-field').classList).toContain(
        'ss-field--invalid',
      );
    });

    it('uses the limit errors too', async () => {
      render((host) => host.min.set(new Date(2027, 0, 10)));

      type('01/01/2027');
      control.markAsTouched();
      fixture.detectChanges();

      expect(errorText()).toBe('Too early');
    });
  });

  describe('disabled', () => {
    it('disables the input and the button', () => {
      render();

      control.disable();
      fixture.detectChanges();

      expect(input().disabled).toBe(true);
      expect(toggle().disabled).toBe(true);
      expect(field().classList).toContain('ss-field--disabled');
    });

    it('is disabled from the start when the control is', () => {
      render((host) => host.control.disable());

      expect(input().disabled).toBe(true);
      expect(toggle().disabled).toBe(true);
    });

    it('does not open the calendar', async () => {
      render();
      control.disable();
      fixture.detectChanges();

      toggle().click();
      await settle();

      expect(toggle().disabled).toBe(true);
      expect(calendar()).toBeNull();
    });

    it('does not open the calendar when it is asked to by code', async () => {
      render();
      control.disable();
      fixture.detectChanges();
      const picker = fixture.debugElement.query(By.directive(SsDatepicker)).componentInstance;

      picker.toggleCalendar();
      await settle();

      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('can be enabled again', () => {
      render();
      control.disable();
      fixture.detectChanges();

      control.enable();
      fixture.detectChanges();

      expect(input().disabled).toBe(false);
      expect(toggle().disabled).toBe(false);
    });

    it('closes an open calendar when disabled', async () => {
      render();
      await openCalendar();
      expect(calendar()).not.toBeNull();

      control.disable();
      await settle();

      expect(calendar()).toBeNull();
    });
  });

  describe('touched', () => {
    it('is touched when focus leaves the input for somewhere else', () => {
      render();
      focusOn(input());
      expect(control.touched).toBe(false);

      focusOn(root().querySelector<HTMLElement>('.after')!);

      expect(control.touched).toBe(true);
    });

    it('is not touched when focus moves from the input to the button', () => {
      render();
      focusOn(input());

      focusOn(toggle());

      expect(control.touched).toBe(false);
    });

    it('is not touched when focus moves from the button back to the input', () => {
      render();
      focusOn(toggle());

      focusOn(input());

      expect(control.touched).toBe(false);
    });

    it('is touched when focus leaves from the button', () => {
      render();
      focusOn(toggle());

      focusOn(root().querySelector<HTMLElement>('.before')!);

      expect(control.touched).toBe(true);
    });

    it('is not touched by typing alone', () => {
      render();
      focusOn(input());

      type('05/02/2027');

      expect(control.touched).toBe(false);
    });

    it('is not touched while the calendar is open and takes the focus', async () => {
      render();
      focusOn(toggle());

      await openCalendar();

      expect(calendar()).not.toBeNull();
      expect(control.touched).toBe(false);
    });

    it('is not touched when the calendar is closed with Escape', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(calendar()).toBeNull();
      expect(control.touched).toBe(false);
    });

    it('is touched by picking a day', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      day('18 November 2026').click();
      await settle();

      expect(control.touched).toBe(true);
    });

    it('is touched when the calendar is closed by a click that moved the focus elsewhere', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      const after = root().querySelector<HTMLButtonElement>('.after')!;
      after.focus();
      after.click();
      await settle();

      expect(calendar()).toBeNull();
      expect(document.activeElement).toBe(after);
      expect(control.touched).toBe(true);
    });
  });

  describe('calendar button', () => {
    it('is a labelled button that announces a dialog and is collapsed', () => {
      render();

      expect(toggle().tagName).toBe('BUTTON');
      expect(toggle().type).toBe('button');
      expect(toggle().getAttribute('aria-label')).toBe('Choose date');
      expect(toggle().getAttribute('aria-haspopup')).toBe('dialog');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('is a normal tab stop after the input', () => {
      render();

      expect(toggle().tabIndex).toBe(0);
      const order = [...root().querySelectorAll<HTMLElement>('input, button')];
      expect(order.indexOf(toggle())).toBe(order.indexOf(input()) + 1);
    });

    it('opens a calendar named "Choose a date" and says it is expanded', async () => {
      render();

      await openCalendar();

      expect(calendar()!.getAttribute('aria-label')).toBe('Choose a date');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    describe('position', () => {
      // jsdom has no layout: the field is placed by hand, and the calendar is 280 by 300
      function placeFieldAt(top: number) {
        const origin = field().querySelector('.ss-field__box')!;
        const rect = (box: Partial<DOMRect>) => ({ x: 0, y: 0, ...box }) as DOMRect;
        // The overlay fits the position in the size of the page, which is 0 by 0 here
        Object.defineProperty(document.documentElement, 'clientWidth', {
          configurable: true,
          value: 1024,
        });
        Object.defineProperty(document.documentElement, 'clientHeight', {
          configurable: true,
          value: 768,
        });
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
          this: HTMLElement,
        ) {
          return this === origin
            ? rect({ top, bottom: top + 44, left: 50, right: 350, width: 300, height: 44 })
            : rect({ top: 0, bottom: 300, left: 0, right: 280, width: 280, height: 300 });
        });
      }
      const pane = () => calendar()!.closest<HTMLElement>('.cdk-overlay-pane')!;
      // The room it is given on the page: the pane sits in it, against its top or its bottom
      const room = () => pane().parentElement!;

      afterEach(() => {
        vi.restoreAllMocks();
        delete (document.documentElement as unknown as Record<string, unknown>)['clientWidth'];
        delete (document.documentElement as unknown as Record<string, unknown>)['clientHeight'];
      });

      it('hangs the calendar below the box of the field', async () => {
        render();
        placeFieldAt(100);

        await openCalendar();

        // Under the bottom of the box (100 + 44), 4 px of air, the left edges together
        expect(room().style.top).toBe('144px');
        expect(room().style.bottom).toBe('auto');
        expect(room().style.left).toBe('50px');
        expect(pane().style.transform).toBe('translateY(4px)');
      });

      it('hangs it above the box when there is no room below', async () => {
        render();
        placeFieldAt(700);

        await openCalendar();

        expect(calendar()).not.toBeNull();
        // Over the top of the box (100 to 700 is 700 of the 768 high page): anchored by its bottom
        expect(room().style.top).toBe('auto');
        expect(room().style.bottom).toBe('68px');
        expect(room().style.left).toBe('50px');
        expect(pane().style.transform).toBe('translateY(-4px)');
      });
    });

    it('closes the calendar when clicked again', async () => {
      render();
      await openCalendar();
      expect(calendar()).not.toBeNull();

      toggle().click();
      await settle();

      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('opens again after it was closed', async () => {
      render();
      await openCalendar();
      toggle().click();
      await settle();
      await new Promise((resolve) => setTimeout(resolve));

      await openCalendar();

      expect(calendar()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('moves focus to the day that is today when there is no date', async () => {
      render();

      await openCalendar();

      expect(document.activeElement?.getAttribute('aria-label')).toBe('15 November 2026');
    });

    it('opens on the month of the date and focuses that day', async () => {
      render((host) => host.control.setValue(new Date(2027, 2, 5)));

      await openCalendar();

      expect(document.activeElement?.getAttribute('aria-label')).toBe('5 March 2027');
      expect(calendar()!.querySelector('.ss-calendar__heading')!.textContent!.trim()).toBe(
        'March 2027',
      );
    });

    it('shows the typed date in the calendar', async () => {
      render();
      type('24/12/2026');

      await openCalendar();

      expect(document.activeElement?.getAttribute('aria-label')).toBe('24 December 2026');
    });

    it('does not mark a date that was typed wrong', async () => {
      render();
      type('tomorrow');

      await openCalendar();

      expect(document.activeElement?.getAttribute('aria-label')).toBe('15 November 2026');
    });

    it('greys out the days outside min and max', async () => {
      render((host) => {
        host.min.set(new Date(2026, 10, 10));
        host.max.set(new Date(2026, 10, 20));
      });

      await openCalendar();

      expect(day('9 November 2026').getAttribute('aria-disabled')).toBe('true');
      expect(day('10 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('20 November 2026').getAttribute('aria-disabled')).toBeNull();
      expect(day('21 November 2026').getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('picking from the calendar', () => {
    it('sets the value and the text, and closes the calendar', async () => {
      render();
      await openCalendar();

      day('18 November 2026').click();
      await settle();

      expect(toIsoDate(control.value!)).toBe('2026-11-18');
      expect(control.value!.getHours()).toBe(0);
      expect(input().value).toBe('18/11/2026');
      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('returns the focus to the button', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      day('18 November 2026').click();
      await settle();

      expect(document.activeElement).toBe(toggle());
    });

    it('returns the focus to the button even when the click did not focus it', async () => {
      render();
      focusOn(root().querySelector<HTMLElement>('.before')!);
      expect(document.activeElement).not.toBe(toggle());

      await openCalendar();
      day('18 November 2026').click();
      await settle();

      expect(document.activeElement).toBe(toggle());
    });

    it('picks with the keyboard', async () => {
      render();
      await openCalendar();

      keydown(document.activeElement!, 'ArrowRight');
      await settle();
      keydown(document.activeElement!, 'Enter');
      await settle();

      expect(toIsoDate(control.value!)).toBe('2026-11-16');
      expect(input().value).toBe('16/11/2026');
    });

    it('replaces a wrong text and its parse error', async () => {
      render();
      type('tomorrow');
      expect(control.hasError('dateParse')).toBe(true);

      await openCalendar();
      day('18 November 2026').click();
      await settle();

      expect(control.hasError('dateParse')).toBe(false);
      expect(input().value).toBe('18/11/2026');
    });

    it('replaces an earlier pick', async () => {
      render((host) => host.control.setValue(new Date(2026, 10, 3)));
      await openCalendar();

      day('4 November 2026').click();
      await settle();

      expect(toIsoDate(control.value!)).toBe('2026-11-04');
    });

    it('does not pick a day outside the limits', async () => {
      render((host) => host.min.set(new Date(2026, 10, 10)));
      await openCalendar();

      day('9 November 2026').click();
      await settle();

      expect(control.value).toBeNull();
      expect(calendar()).not.toBeNull();
    });

    it('marks the form as changed', async () => {
      render();
      await openCalendar();
      const changes: (Date | null)[] = [];
      control.valueChanges.subscribe((value) => changes.push(value));

      day('18 November 2026').click();
      await settle();

      expect(changes.length).toBe(1);
      expect(toIsoDate(changes[0]!)).toBe('2026-11-18');
    });

    describeInTimeZones('picking', () => {
      it('picks across a daylight-saving change without moving the day', async () => {
        render((host) => host.control.setValue(new Date(2026, 9, 25)));
        await openCalendar();

        day('26 October 2026').click();
        await settle();

        expect(toIsoDate(control.value!)).toBe('2026-10-26');
        expect(input().value).toBe('26/10/2026');
        expect(control.value!.getHours()).toBe(0);
      });

      it('picks the day of the clock change itself at midnight', async () => {
        render((host) => host.control.setValue(new Date(2026, 2, 28)));
        await openCalendar();

        day('29 March 2026').click();
        await settle();

        expect(toIsoDate(control.value!)).toBe('2026-03-29');
        expect(input().value).toBe('29/03/2026');
        expect(control.value!.getHours()).toBe(0);
      });
    });
  });

  describe('closing the calendar', () => {
    it('closes with Escape and returns the focus to the button', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(calendar()).toBeNull();
      expect(document.activeElement).toBe(toggle());
      expect(control.value).toBeNull();
    });

    it('closes with a click outside', async () => {
      render();
      focusOn(toggle());
      await openCalendar();

      document.body.click();
      await settle();

      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes when the datepicker is destroyed', async () => {
      render();
      await openCalendar();

      fixture.destroy();

      expect(calendar()).toBeNull();
    });
  });

  describe('keyboard', () => {
    it('opens the calendar with Alt+Arrow Down on the input', async () => {
      render();
      focusOn(input());

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      input().dispatchEvent(event);
      await settle();

      expect(event.defaultPrevented).toBe(true);
      expect(calendar()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('returns the focus to the input when the calendar was opened from it', async () => {
      render();
      focusOn(input());
      input().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
      );
      await settle();

      keydown(document.activeElement!, 'Escape');
      await settle();

      expect(calendar()).toBeNull();
      expect(document.activeElement).toBe(input());
      expect(control.touched).toBe(false);
    });

    it('does not open the calendar on Arrow Down alone', async () => {
      render();
      focusOn(input());

      keydown(input(), 'ArrowDown');
      await settle();

      expect(calendar()).toBeNull();
    });

    it('does not open the calendar with Alt+Arrow Down while disabled', async () => {
      render();
      control.disable();
      fixture.detectChanges();

      input().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
      );
      await settle();

      expect(calendar()).toBeNull();
    });
  });

  describe('without an ss-field', () => {
    it('is named by ariaLabel and takes the id', () => {
      const bare = TestBed.createComponent(BareHost);
      bare.detectChanges();
      const text = bare.nativeElement.querySelector('input') as HTMLInputElement;

      expect(text.getAttribute('aria-label')).toBe('Birthday');
      expect(text.id).toBe('birthday');
    });

    it('does not name the input by ariaLabel inside an ss-field', () => {
      render();

      expect(input().hasAttribute('aria-label')).toBe(false);
    });
  });
});
