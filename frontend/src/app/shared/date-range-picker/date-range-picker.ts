import {
  booleanAttribute,
  Component,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { provideDayFirstDates } from '../dates';

/** A period picked in the control. Both ends are `null` until a date is entered. */
export interface DateRangeValue {
  start: Date | null;
  end: Date | null;
}

/**
 * A start and an end date in one Material date-range field, optionally limited by `min` and `max`
 * (e.g. the request period must stay inside the project period). Works with reactive forms:
 *
 * ```html
 * <app-date-range-picker formControlName="period" label="Period" required
 *     [min]="projectStart" [max]="projectEnd" />
 * ```
 *
 * The control's value is a {@link DateRangeValue}. The control is invalid, with `required` when
 * `required` is set and a date is missing, and with Material's own errors (`matDatepickerParse`,
 * `matDatepickerMin`, `matDatepickerMax`, `matStartDateInvalid`, `matEndDateInvalid`) otherwise.
 * A message from the server is shown too when it is set under the key `server`:
 * `control.setErrors({ server: 'Message' })`.
 */
@Component({
  selector: 'app-date-range-picker',
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule],
  providers: [
    provideDayFirstDates(),
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateRangePicker),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => DateRangePicker),
      multi: true,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="date-range-picker" (focusout)="onFocusOut($event)">
      <mat-label>{{ label() }}</mat-label>
      <mat-date-range-input [formGroup]="range" [rangePicker]="picker" [min]="min()" [max]="max()">
        <input matStartDate formControlName="start" placeholder="Start date" />
        <input matEndDate formControlName="end" placeholder="End date" />
      </mat-date-range-input>
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-date-range-picker #picker />
    </mat-form-field>
    @if (errorMessage(); as message) {
      <p class="date-range-picker__error" role="alert">{{ message }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .date-range-picker {
      width: 100%;
    }
    .date-range-picker__error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: -12px 0 8px 16px;
    }
  `,
})
export class DateRangePicker implements ControlValueAccessor, Validator {
  readonly label = input('Period');
  /** The earliest date that can be picked. */
  readonly min = input<Date | null>(null);
  /** The latest date that can be picked. */
  readonly max = input<Date | null>(null);
  /** Both dates must be entered. */
  readonly required = input(false, { transform: booleanAttribute });

  protected readonly range = inject(NonNullableFormBuilder).group({
    start: null as Date | null,
    end: null as Date | null,
  });

  protected readonly errorMessage = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  /** The control this one is bound to, to read its errors and whether it was touched. */
  private outer: AbstractControl | null = null;
  private onChange: (value: DateRangeValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  constructor() {
    this.range.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.onChange(this.range.getRawValue());
    });
    // The limits and `required` are part of the validation, so a change runs it again
    effect(() => {
      this.min();
      this.max();
      this.required();
      queueMicrotask(() => this.onValidatorChange());
    });
  }

  writeValue(value: DateRangeValue | null): void {
    this.range.setValue(
      { start: value?.start ?? null, end: value?.end ?? null },
      { emitEvent: false },
    );
  }

  registerOnChange(fn: (value: DateRangeValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) {
      this.range.disable({ emitEvent: false });
    } else {
      this.range.enable({ emitEvent: false });
    }
  }

  validate(control: AbstractControl): ValidationErrors | null {
    this.follow(control);
    const { start, end } = this.range.controls;
    const errors: ValidationErrors = { ...start.errors, ...end.errors };
    if (this.required() && (!start.value || !end.value) && !errors['matDatepickerParse']) {
      errors['required'] = true;
    }
    return Object.keys(errors).length > 0 ? errors : null;
  }

  /** Touched means focus left the whole field, not just moved from the start date to the end date. */
  protected onFocusOut(event: FocusEvent): void {
    const field = event.currentTarget as HTMLElement;
    if (!field.contains(event.relatedTarget as Node | null)) {
      this.onTouched();
    }
  }

  /**
   * The bound control's errors and touched state can change from outside (the server's errors, a
   * submit that touches every field), so the message is updated from the control's own events.
   */
  private follow(control: AbstractControl): void {
    if (this.outer === control) {
      return;
    }
    this.outer = control;
    control.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.errorMessage.set(this.messageFor(control)));
  }

  private messageFor(control: AbstractControl): string | null {
    const errors = control.errors;
    if (!errors) {
      return null;
    }
    if (typeof errors['server'] === 'string') {
      return errors['server'];
    }
    if (!control.touched) {
      return null;
    }
    if (errors['matDatepickerParse']) {
      return 'Enter valid dates';
    }
    if (errors['matStartDateInvalid'] || errors['matEndDateInvalid']) {
      return 'Start date must not be after end date';
    }
    if (errors['matDatepickerMin'] || errors['matDatepickerMax']) {
      return this.limitsMessage();
    }
    return errors['required'] ? 'Start and end dates are required' : null;
  }

  private limitsMessage(): string {
    const format = (date: Date | null) => (date ? date.toLocaleDateString('en-GB') : null);
    const min = format(this.min());
    const max = format(this.max());
    if (min && max) {
      return `Dates must be between ${min} and ${max}`;
    }
    return min ? `Dates must not be before ${min}` : `Dates must not be after ${max}`;
  }
}
