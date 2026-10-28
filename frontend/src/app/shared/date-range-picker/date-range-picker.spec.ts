import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DateRangePicker, DateRangeValue } from './date-range-picker';

@Component({
  imports: [ReactiveFormsModule, DateRangePicker],
  template: `<app-date-range-picker
    [formControl]="period"
    label="Period"
    [required]="required()"
    [min]="min()"
    [max]="max()"
  />`,
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

describe('DateRangePicker', () => {
  let fixture: ComponentFixture<Host>;

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await settle();
  }

  /** The inputs and the error message each take a round of change detection to settle. */
  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function inputs(): HTMLInputElement[] {
    return [...el().querySelectorAll<HTMLInputElement>('input')];
  }

  /** Types a date the way a user does. The picker reads it day first, like it shows it: `dd/MM/yyyy`. */
  async function type(input: HTMLInputElement, text: string): Promise<void> {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function touch(): Promise<void> {
    fixture.componentInstance.period.markAsTouched();
    await settle();
  }

  function message(): string {
    return el().querySelector('[role="alert"]')?.textContent?.trim() ?? '';
  }

  it('shows a start and an end date input', async () => {
    await render();

    expect(inputs()).toHaveLength(2);
    expect(el().textContent).toContain('Period');
  });

  it('writes the typed dates to the form control', async () => {
    await render();

    await type(inputs()[0], '02/11/2026');
    await type(inputs()[1], '31/01/2027');

    const { start, end } = fixture.componentInstance.period.value;
    expect(start).toEqual(new Date(2026, 10, 2));
    expect(end).toEqual(new Date(2027, 0, 31));
    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('reads a typed date day first, so 05/02/2027 is 5 February', async () => {
    await render();

    await type(inputs()[0], '02/11/2026');
    await type(inputs()[1], '05/02/2027');

    // read month first it would be 2 May, which is after the maximum
    expect(fixture.componentInstance.period.value.end).toEqual(new Date(2027, 1, 5));
    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('shows the value set from code', async () => {
    await render();

    fixture.componentInstance.period.setValue({
      start: new Date(2026, 10, 2),
      end: new Date(2027, 0, 31),
    });
    await settle();

    // shown day first (en-GB)
    expect(inputs()[0].value).toBe('02/11/2026');
    expect(inputs()[1].value).toBe('31/01/2027');
  });

  it('is invalid with `required` until both dates are entered', async () => {
    await render();
    expect(fixture.componentInstance.period.hasError('required')).toBe(true);

    await type(inputs()[0], '02/11/2026');
    expect(fixture.componentInstance.period.hasError('required')).toBe(true);

    await type(inputs()[1], '31/01/2027');
    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('is valid without dates when it is not required', async () => {
    await render();

    fixture.componentInstance.required.set(false);
    await settle();
    await settle();

    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('only says the dates are required once the field was touched', async () => {
    await render();
    expect(message()).toBe('');

    await touch();

    expect(message()).toBe('Start and end dates are required');
  });

  it('rejects a start before the minimum', async () => {
    await render();

    await type(inputs()[0], '31/10/2026');
    await type(inputs()[1], '31/01/2027');
    await touch();

    expect(fixture.componentInstance.period.hasError('dateMin')).toBe(true);
    expect(message()).toBe('Dates must be between 01/11/2026 and 31/03/2027');
  });

  it('rejects an end after the maximum', async () => {
    await render();

    await type(inputs()[0], '02/11/2026');
    await type(inputs()[1], '01/04/2027');
    await touch();

    expect(fixture.componentInstance.period.hasError('dateMax')).toBe(true);
    expect(message()).toContain('Dates must be between');
  });

  it('accepts dates on the limits', async () => {
    await render();

    await type(inputs()[0], '01/11/2026');
    await type(inputs()[1], '31/03/2027');

    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('rejects an end before the start', async () => {
    await render();

    await type(inputs()[0], '10/12/2026');
    await type(inputs()[1], '09/12/2026');
    await touch();

    expect(fixture.componentInstance.period.invalid).toBe(true);
    expect(message()).toBe('Start date must not be after end date');
  });

  it('allows a one-day period', async () => {
    await render();

    await type(inputs()[0], '10/12/2026');
    await type(inputs()[1], '10/12/2026');

    expect(fixture.componentInstance.period.valid).toBe(true);
  });

  it('revalidates when the limits change', async () => {
    await render();
    await type(inputs()[0], '02/11/2026');
    await type(inputs()[1], '31/01/2027');
    expect(fixture.componentInstance.period.valid).toBe(true);

    fixture.componentInstance.max.set(new Date(2027, 0, 15));
    await settle();
    await settle();

    expect(fixture.componentInstance.period.hasError('dateMax')).toBe(true);
  });

  it('shows an error that the server set on the control', async () => {
    await render();

    fixture.componentInstance.period.setErrors({ server: 'The period is outside the project' });
    await settle();

    expect(message()).toBe('The period is outside the project');
  });

  it('can be disabled through the form control', async () => {
    await render();

    fixture.componentInstance.period.disable();
    await settle();

    expect(inputs().every((input) => input.disabled)).toBe(true);
  });
});
