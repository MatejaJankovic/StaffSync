import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SsField, SsInput, SsLabel } from '../field/field';
import { describeInTimeZones } from '../testing';
import { SsDateInput } from './date-input';

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsInput, SsDateInput],
  template: `
    <ss-field>
      <ss-label>Start date</ss-label>
      <input ssInput ssDateInput [formControl]="control" [min]="min()" [max]="max()" />
    </ss-field>
  `,
})
class Host {
  readonly control = new FormControl<Date | null>(null);
  readonly min = signal<Date | null>(null);
  readonly max = signal<Date | null>(null);
}

describe('SsDateInput', () => {
  let fixture: ComponentFixture<Host>;
  let input: HTMLInputElement;
  let control: FormControl<Date | null>;

  function render(setup?: (host: Host) => void) {
    fixture = TestBed.createComponent(Host);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
    control = fixture.componentInstance.control;
  }

  function type(text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function blur() {
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  /** A change of min or max revalidates in a microtask. */
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function directive(): SsDateInput {
    return fixture.debugElement
      .query((el) => el.injector.get(SsDateInput, null) !== null)
      .injector.get(SsDateInput);
  }

  it('works together with ssInput on the same element', () => {
    render();

    expect(input.classList).toContain('ss-input');
    expect(input.id).toMatch(/^ss-input-/);
    expect(fixture.nativeElement.querySelector('label').getAttribute('for')).toBe(input.id);
  });

  describe('typing', () => {
    it('reads text as day/month/year into a local-midnight Date', () => {
      render();

      type('05/02/2027');

      expect(control.value).toEqual(new Date(2027, 1, 5));
      expect(control.value!.getHours()).toBe(0);
      expect(control.errors).toBeNull();
    });

    it('accepts / . and - as separators and one-digit days and months', () => {
      render();

      for (const text of ['31/03/2027', '31.03.2027', '31-03-2027', ' 31/03/2027 ']) {
        type(text);
        expect(control.value, text).toEqual(new Date(2027, 2, 31));
      }
      type('1.4.2027');
      expect(control.value).toEqual(new Date(2027, 3, 1));
    });

    it('gives null for empty or blank text, without an error', () => {
      render();
      type('05/02/2027');

      type('');
      expect(control.value).toBeNull();
      expect(control.errors).toBeNull();

      type('05/02/2027');
      type('   ');
      expect(control.value).toBeNull();
      expect(control.errors).toBeNull();
      expect(directive().textInvalid()).toBe(false);
    });

    it('reports dateParse and a null value for text that is not a date', () => {
      render();

      for (const text of [
        'tomorrow',
        '2027-03-31',
        '12/13/2027',
        '5/2/27',
        '05/02',
        '05/02/2027x',
      ]) {
        type(text);
        expect(control.value, text).toBeNull();
        expect(control.errors, text).toEqual({ dateParse: { text } });
        expect(directive().textInvalid(), text).toBe(true);
      }
    });

    it('rejects a day that does not exist', () => {
      render();

      for (const text of [
        '31/02/2027',
        '30/02/2028',
        '31/04/2027',
        '00/01/2027',
        '01/00/2027',
        '32/01/2027',
      ]) {
        type(text);
        expect(control.errors, text).toEqual({ dateParse: { text } });
      }
    });

    it('accepts 29 February in a leap year and rejects it in any other', () => {
      render();

      type('29/02/2028');
      expect(control.value).toEqual(new Date(2028, 1, 29));
      expect(control.errors).toBeNull();

      type('29/02/2027');
      expect(control.value).toBeNull();
      expect(control.hasError('dateParse')).toBe(true);

      // 1900 was not a leap year, 2000 was
      type('29/02/1900');
      expect(control.hasError('dateParse')).toBe(true);
      type('29/02/2000');
      expect(control.value).toEqual(new Date(2000, 1, 29));
    });

    it('accepts the first and last day of a month and of the year', () => {
      render();

      for (const [text, date] of [
        ['01/01/2027', new Date(2027, 0, 1)],
        ['31/12/2027', new Date(2027, 11, 31)],
        ['30/04/2027', new Date(2027, 3, 30)],
      ] as const) {
        type(text);
        expect(control.value, text).toEqual(date);
      }
    });

    it('clears the parse error as soon as the text is fixed or cleared', () => {
      render();

      type('31/02/2027');
      expect(control.invalid).toBe(true);

      type('28/02/2027');
      expect(control.valid).toBe(true);
      expect(control.value).toEqual(new Date(2027, 1, 28));
      expect(directive().textInvalid()).toBe(false);

      type('nope');
      expect(control.invalid).toBe(true);
      type('');
      expect(control.valid).toBe(true);
    });

    it('does not touch the control while typing', () => {
      render();

      type('05/02/2027');

      expect(control.touched).toBe(false);
      expect(control.dirty).toBe(true);
    });
  });

  describe('blur', () => {
    it('touches the control', () => {
      render();

      blur();

      expect(control.touched).toBe(true);
    });

    it('formats a valid date as dd/MM/yyyy, zero-padded', () => {
      render();

      type('1.4.2027');
      expect(input.value).toBe('1.4.2027');
      blur();

      expect(input.value).toBe('01/04/2027');
      expect(control.value).toEqual(new Date(2027, 3, 1));
    });

    it('leaves text that is not a date as typed, and keeps the error', () => {
      render();

      type('31/02/2027');
      blur();

      expect(input.value).toBe('31/02/2027');
      expect(control.hasError('dateParse')).toBe(true);
      expect(control.touched).toBe(true);
    });

    it('leaves an empty input empty', () => {
      render();

      type('');
      blur();

      expect(input.value).toBe('');
    });
  });

  describe('writeValue', () => {
    it('shows a Date as dd/MM/yyyy', () => {
      render();

      control.setValue(new Date(2027, 0, 5));

      expect(input.value).toBe('05/01/2027');
    });

    it('shows a Date with a time of day as its local day', () => {
      render();

      control.setValue(new Date(2027, 11, 31, 23, 59, 59));

      expect(input.value).toBe('31/12/2027');
    });

    it('shows a leap day', () => {
      render();

      control.setValue(new Date(2028, 1, 29));

      expect(input.value).toBe('29/02/2028');
    });

    it('shows a value that is there from the start', () => {
      render((host) => host.control.setValue(new Date(2026, 10, 2)));

      expect(input.value).toBe('02/11/2026');
    });

    it('clears the text for null and for an Invalid Date', () => {
      render();
      control.setValue(new Date(2027, 0, 5));

      control.setValue(null);
      expect(input.value).toBe('');

      control.setValue(new Date(2027, 0, 5));
      control.setValue(new Date(NaN));
      expect(input.value).toBe('');
    });

    it('clears a parse error: a reset removes text that was not a date', () => {
      render();
      type('31/02/2027');
      expect(control.invalid).toBe(true);

      control.reset();

      expect(input.value).toBe('');
      expect(control.valid).toBe(true);
      expect(directive().textInvalid()).toBe(false);
    });

    it('does not emit a change', () => {
      render();
      let emitted = 0;
      control.valueChanges.subscribe(() => emitted++);

      control.setValue(new Date(2027, 0, 5), { emitEvent: false });
      control.patchValue(null, { emitEvent: false });

      expect(emitted).toBe(0);
    });
  });

  describe('min and max', () => {
    const limit = new Date(2027, 2, 15);

    it('compares whole days: a date equal to the limit is valid', () => {
      render((host) => {
        host.min.set(limit);
        host.max.set(limit);
      });

      type('15/03/2027');

      expect(control.errors).toBeNull();
    });

    it('ignores the time of day of the limit and of the value', () => {
      render((host) => {
        host.min.set(new Date(2027, 2, 15, 18, 30));
        host.max.set(new Date(2027, 2, 15, 6, 0));
      });

      control.setValue(new Date(2027, 2, 15, 12, 0));
      expect(control.errors).toBeNull();
      control.setValue(new Date(2027, 2, 15, 0, 0, 0));
      expect(control.errors).toBeNull();
      control.setValue(new Date(2027, 2, 15, 23, 59, 59));
      expect(control.errors).toBeNull();
    });

    it('reports dateMin one day before the minimum, with the limit and the value', () => {
      render((host) => host.min.set(limit));

      type('14/03/2027');

      expect(control.errors).toEqual({
        dateMin: { min: limit, actual: new Date(2027, 2, 14) },
      });
      expect(control.value).toEqual(new Date(2027, 2, 14));
    });

    it('reports dateMax one day after the maximum, with the limit and the value', () => {
      render((host) => host.max.set(limit));

      type('16/03/2027');

      expect(control.errors).toEqual({
        dateMax: { max: limit, actual: new Date(2027, 2, 16) },
      });
    });

    it('accepts the day after the minimum and the day before the maximum', () => {
      render((host) => {
        host.min.set(limit);
        host.max.set(new Date(2027, 2, 17));
      });

      type('16/03/2027');

      expect(control.errors).toBeNull();
    });

    it('compares across a month end, a year end and a leap day', () => {
      render((host) => host.min.set(new Date(2028, 2, 1)));

      type('29/02/2028');
      expect(control.hasError('dateMin')).toBe(true);
      type('01/03/2028');
      expect(control.errors).toBeNull();
    });

    it('compares across a year end', () => {
      render((host) => host.min.set(new Date(2028, 0, 1)));

      type('31/12/2027');
      expect(control.hasError('dateMin')).toBe(true);
      type('01/01/2028');
      expect(control.errors).toBeNull();
    });

    describeInTimeZones('limits', () => {
      it('compares across the daylight saving changes of March and October', () => {
        // The days around the clock changes of Europe and the USA, where a day is 23 or 25 hours
        const days = [
          new Date(2027, 2, 13),
          new Date(2027, 2, 14),
          new Date(2027, 2, 27),
          new Date(2027, 2, 28),
          new Date(2027, 9, 30),
          new Date(2027, 9, 31),
          new Date(2027, 10, 6),
          new Date(2027, 10, 7),
        ];
        render();
        for (const day of days) {
          fixture.componentInstance.min.set(day);
          fixture.componentInstance.max.set(day);
          fixture.detectChanges();
          control.setValue(day);
          expect(control.errors, String(day)).toBeNull();
          control.setValue(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 23, 59));
          expect(control.hasError('dateMin'), String(day)).toBe(true);
          control.setValue(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
          expect(control.hasError('dateMax'), String(day)).toBe(true);
        }
      });
    });

    it('does not report a limit for an empty input', () => {
      render((host) => {
        host.min.set(limit);
        host.max.set(limit);
      });

      type('');

      expect(control.errors).toBeNull();
    });

    it('reports the parse error rather than a limit for text that is not a date', () => {
      render((host) => host.min.set(limit));

      type('31/02/2027');

      expect(Object.keys(control.errors!)).toEqual(['dateParse']);
    });

    it('revalidates when the minimum changes', async () => {
      render();
      type('10/03/2027');
      expect(control.valid).toBe(true);

      fixture.componentInstance.min.set(limit);
      await settle();
      expect(control.hasError('dateMin')).toBe(true);

      fixture.componentInstance.min.set(new Date(2027, 2, 10));
      await settle();
      expect(control.valid).toBe(true);

      fixture.componentInstance.min.set(null);
      await settle();
      expect(control.valid).toBe(true);
    });

    it('revalidates when the maximum changes', async () => {
      render();
      type('20/03/2027');
      expect(control.valid).toBe(true);

      fixture.componentInstance.max.set(limit);
      await settle();
      expect(control.hasError('dateMax')).toBe(true);

      fixture.componentInstance.max.set(null);
      await settle();
      expect(control.valid).toBe(true);
    });

    it('does not run a validation on the first render', async () => {
      render((host) => host.min.set(limit));
      let emitted = 0;
      control.statusChanges.subscribe(() => emitted++);

      await settle();

      expect(emitted).toBe(0);
    });

    it('ignores a limit that is an Invalid Date', () => {
      render((host) => host.min.set(new Date(NaN)));

      type('01/01/1990');

      expect(control.errors).toBeNull();
    });
  });

  describe('disabled', () => {
    it('disables the input with the control, and enables it again', () => {
      render();

      control.disable();
      expect(input.disabled).toBe(true);
      expect(directive().disabled()).toBe(true);

      control.enable();
      expect(input.disabled).toBe(false);
      expect(directive().disabled()).toBe(false);
    });

    it('starts disabled when the control is', () => {
      render((host) => host.control.disable());

      expect(input.disabled).toBe(true);
    });

    it('does not set a date while disabled', () => {
      render();
      control.disable();

      directive().set(new Date(2027, 0, 5));

      expect(input.value).toBe('');
      expect(control.value).toBeNull();
    });
  });

  describe('set(date)', () => {
    it('writes the text, sets the value and touches the control, like typing and leaving', () => {
      render();

      directive().set(new Date(2027, 0, 5));

      expect(input.value).toBe('05/01/2027');
      expect(control.value).toEqual(new Date(2027, 0, 5));
      expect(control.touched).toBe(true);
      expect(control.dirty).toBe(true);
    });

    it('emits one value change', () => {
      render();
      const values: (Date | null)[] = [];
      control.valueChanges.subscribe((value) => values.push(value));

      directive().set(new Date(2028, 1, 29));

      expect(values).toEqual([new Date(2028, 1, 29)]);
      expect(input.value).toBe('29/02/2028');
    });

    it('replaces text that is not a date and clears the parse error', () => {
      render();
      type('31/02/2027');

      directive().set(new Date(2027, 1, 28));

      expect(input.value).toBe('28/02/2027');
      expect(control.valid).toBe(true);
      expect(directive().textInvalid()).toBe(false);
    });

    it('validates against the limits', () => {
      render((host) => host.max.set(new Date(2027, 0, 1)));

      directive().set(new Date(2027, 0, 2));

      expect(control.hasError('dateMax')).toBe(true);
    });

    it('clears the input for null', () => {
      render();
      type('05/02/2027');

      directive().set(null);

      expect(input.value).toBe('');
      expect(control.value).toBeNull();
    });

    it('exposes the date it holds', () => {
      render();

      type('05/02/2027');
      expect(directive().value()).toEqual(new Date(2027, 1, 5));
      type('nope');
      expect(directive().value()).toBeNull();
    });
  });

  it('works with a required validator on the control', () => {
    render();
    control.addValidators(Validators.required);
    control.updateValueAndValidity();

    expect(control.hasError('required')).toBe(true);
    type('05/02/2027');
    expect(control.valid).toBe(true);
    type('nope');
    expect(control.hasError('required')).toBe(true);
    expect(control.hasError('dateParse')).toBe(true);
  });

  it('shows the error state of the field once touched', () => {
    render();
    type('31/02/2027');
    expect(fixture.nativeElement.querySelector('ss-field').classList).not.toContain(
      'ss-field--invalid',
    );

    blur();

    expect(fixture.nativeElement.querySelector('ss-field').classList).toContain(
      'ss-field--invalid',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
