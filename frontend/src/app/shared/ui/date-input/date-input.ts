import { Directive, effect, ElementRef, forwardRef, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { compareDays, formatDayFirstDate, isValidDate, parseDayFirstDate } from '../../dates';

/**
 * A text input for a date, typed and shown as `dd/MM/yyyy` (day first, en-GB). The control's value
 * is a `Date` at local midnight, or `null` when the text is empty or not a date.
 *
 * ```html
 * <ss-field>
 *   <ss-label>Start date</ss-label>
 *   <input ssInput ssDateInput formControlName="start" [min]="minDate" [max]="maxDate" />
 * </ss-field>
 * ```
 *
 * Errors: `dateParse` (the text is not a
 * date, or the day does not exist), `dateMin` and `dateMax` (compared by whole
 * days: a date equal to the limit is valid). The text is tidied to `dd/MM/yyyy` when the input
 * loses focus; text that is not a date is left as typed.
 *
 * `SsDatepicker` calls {@link SsDateInput.set} when a day is picked in the calendar.
 */
@Directive({
  selector: 'input[ssDateInput]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SsDateInput), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => SsDateInput), multi: true },
  ],
  host: {
    '(input)': 'onInput()',
    '(blur)': 'onBlur()',
  },
})
export class SsDateInput implements ControlValueAccessor, Validator {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);

  /** The earliest date that is valid. */
  readonly min = input<Date | null>(null);
  /** The latest date that is valid. */
  readonly max = input<Date | null>(null);

  private readonly textInvalidState = signal(false);
  private readonly disabledState = signal(false);
  private readonly valueState = signal<Date | null>(null);

  /** True while the text in the input is not empty and not a date. */
  readonly textInvalid = this.textInvalidState.asReadonly();
  /** The date the input holds now, `null` when empty or when the text is not a date. */
  readonly value = this.valueState.asReadonly();
  readonly disabled = this.disabledState.asReadonly();

  private onChange: (value: Date | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  constructor() {
    // The limits are part of the validation, so a change of them runs it again. The first run
    // is skipped: the form validated with the limits when the control was set up.
    let first = true;
    effect(() => {
      this.min();
      this.max();
      if (first) {
        first = false;
        return;
      }
      queueMicrotask(() => this.onValidatorChange());
    });
  }

  writeValue(value: Date | null): void {
    this.textInvalidState.set(false);
    this.valueState.set(isValidDate(value) ? value : null);
    this.setText(isValidDate(value) ? formatDayFirstDate(value) : '');
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabledState.set(disabled);
    this.element.nativeElement.disabled = disabled;
  }

  validate(control: AbstractControl): ValidationErrors | null {
    if (this.textInvalidState()) {
      return { dateParse: { text: this.element.nativeElement.value } };
    }
    const actual: unknown = control.value;
    if (!isValidDate(actual)) {
      return null;
    }
    const min = this.min();
    if (isValidDate(min) && compareDays(actual, min) < 0) {
      return { dateMin: { min, actual } };
    }
    const max = this.max();
    if (isValidDate(max) && compareDays(actual, max) > 0) {
      return { dateMax: { max, actual } };
    }
    return null;
  }

  /**
   * Sets the date as if it was typed: the text is written, the control gets the value and is
   * touched. For the calendar that picks a day. Does nothing while the input is disabled.
   */
  set(date: Date | null): void {
    if (this.disabledState()) {
      return;
    }
    const value = isValidDate(date) ? date : null;
    this.textInvalidState.set(false);
    this.valueState.set(value);
    this.setText(value ? formatDayFirstDate(value) : '');
    this.onChange(value);
    this.onTouched();
  }

  /** Moves focus to the input. */
  focus(): void {
    this.element.nativeElement.focus();
  }

  protected onInput(): void {
    const parsed = parseDayFirstDate(this.element.nativeElement.value);
    const valid = isValidDate(parsed);
    // The state is set before the control is told, as its validators run in `onChange`
    this.textInvalidState.set(parsed !== null && !valid);
    const value = valid ? parsed : null;
    this.valueState.set(value);
    this.onChange(value);
  }

  protected onBlur(): void {
    if (!this.textInvalidState()) {
      const value = this.valueState();
      if (value) {
        this.setText(formatDayFirstDate(value));
      }
    }
    this.onTouched();
  }

  private setText(text: string): void {
    const input = this.element.nativeElement;
    if (input.value !== text) {
      input.value = text;
    }
  }
}
