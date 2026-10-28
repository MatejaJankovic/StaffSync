import { DOCUMENT } from '@angular/common';
import {
  booleanAttribute,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
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
  ValidatorFn,
} from '@angular/forms';
import { compareDays, isValidDate } from '../dates';
import { SsButton } from '../ui/button/button';
import { SsCalendarPopup, SsCalendarPopupRef } from '../ui/calendar/calendar-popup';
import { SsDateInput } from '../ui/date-input/date-input';
import { uniqueId } from '../ui/field/field';
import { SsIcon } from '../ui/icon/icon';

/** A period picked in the control. Both ends are `null` until a date is entered. */
export interface DateRangeValue {
  start: Date | null;
  end: Date | null;
}

/**
 * A start and an end date in one field, optionally limited by `min` and `max` (e.g. the request
 * period must stay inside the project period). The dates are typed as `dd/MM/yyyy` or picked in a
 * calendar that opens from the button in the field. Works with reactive forms:
 *
 * ```html
 * <app-date-range-picker formControlName="period" label="Period" required
 *     [min]="projectStart" [max]="projectEnd" />
 * ```
 *
 * The control's value is a {@link DateRangeValue}. The control is invalid, with `required` when
 * `required` is set and a date is missing, and with the errors of the date inputs
 * (`dateParse`, `dateMin`, `dateMax`) or of the order of the two dates (`startDateInvalid`,
 * `endDateInvalid`) otherwise. A message from the server is
 * shown too when it is set under the key `server`: `control.setErrors({ server: 'Message' })`.
 */
@Component({
  selector: 'app-date-range-picker',
  imports: [ReactiveFormsModule, SsButton, SsDateInput, SsIcon],
  providers: [
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
  host: {
    // The kit's field classes are plain global classes: label above, one bordered box
    class: 'ss-field date-range-picker',
    role: 'group',
    '[attr.aria-labelledby]': 'labelId',
    '[class.ss-field--invalid]': 'invalid()',
    '[class.ss-field--focused]': 'focused() || popupOpen()',
    '[class.ss-field--disabled]': 'disabled()',
    '(focusin)': 'focused.set(true)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <label class="ss-field__label" [id]="labelId" [attr.for]="startId">
      {{ label() }}
      @if (required()) {
        <span class="ss-field__required" aria-hidden="true">*</span>
      }
    </label>
    <div class="ss-field__box" #box [formGroup]="range">
      <input
        class="ss-input"
        ssDateInput
        formControlName="start"
        autocomplete="off"
        placeholder="Start date"
        aria-label="Start date"
        #startInput
        [id]="startId"
        [min]="min()"
        [max]="max()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-describedby]="errorMessage() ? errorId : null"
      />
      <span class="date-range-picker__separator" aria-hidden="true">&ndash;</span>
      <input
        class="ss-input"
        ssDateInput
        formControlName="end"
        autocomplete="off"
        placeholder="End date"
        aria-label="End date"
        #endInput
        [min]="min()"
        [max]="max()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-describedby]="errorMessage() ? errorId : null"
      />
      <button
        #toggle
        ss-button="icon"
        type="button"
        aria-label="Choose period"
        aria-haspopup="dialog"
        [attr.aria-expanded]="popupOpen()"
        [disabled]="disabled()"
        (click)="openCalendar()"
      >
        <ss-icon>calendar_month</ss-icon>
      </button>
    </div>
    <div class="ss-field__sub">
      @if (errorMessage(); as message) {
        <p class="date-range-picker__error" role="alert" [id]="errorId">{{ message }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ss-input {
      font-variant-numeric: tabular-nums;
    }
    .date-range-picker__separator {
      flex: none;
      margin-inline: var(--ss-space-2);
      color: var(--ss-ink-muted);
    }
    .date-range-picker__error {
      margin: var(--ss-space-1) 0 0;
      color: var(--ss-danger);
      font-size: var(--ss-text-xs);
      font-weight: 500;
      line-height: 1.4;
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
  protected readonly focused = signal(false);
  protected readonly disabled = signal(false);
  protected readonly popupOpen = signal(false);

  protected readonly labelId = uniqueId('date-range-picker-label');
  protected readonly startId = uniqueId('date-range-picker-start');
  protected readonly errorId = uniqueId('date-range-picker-error');

  private readonly startInput = viewChild.required('startInput', { read: SsDateInput });
  private readonly endInput = viewChild.required('endInput', { read: SsDateInput });
  /** The popup hangs below the whole box. */
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly toggle = viewChild.required('toggle', { read: ElementRef<HTMLButtonElement> });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  private readonly popup = inject(SsCalendarPopup);
  private readonly destroyRef = inject(DestroyRef);
  private popupRef: SsCalendarPopupRef | null = null;
  private opening = false;
  /** The control this one is bound to, to read its errors and whether it was touched. */
  private outer: AbstractControl | null = null;
  private onChange: (value: DateRangeValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  constructor() {
    const { start, end } = this.range.controls;
    // The start is flagged when it is after the end, the end when it
    // is before the start (the same day is a valid period)
    start.addValidators(this.order('startDateInvalid'));
    end.addValidators(this.order('endDateInvalid'));

    this.range.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      // Each end's ordering error depends on the other end, which has just changed
      this.revalidateEnds();
      this.onChange(this.range.getRawValue());
    });
    this.destroyRef.onDestroy(() => this.popupRef?.close());
    // The limits and `required` are part of the validation, so a change runs it again
    effect(() => {
      this.min();
      this.max();
      this.required();
      queueMicrotask(() => {
        this.revalidateEnds();
        this.onValidatorChange();
      });
    });
  }

  writeValue(value: DateRangeValue | null): void {
    this.range.setValue(
      { start: value?.start ?? null, end: value?.end ?? null },
      { emitEvent: false },
    );
    this.revalidateEnds();
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
    this.disabled.set(disabled);
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
    if (this.required() && (!start.value || !end.value) && !errors['dateParse']) {
      errors['required'] = true;
    }
    return Object.keys(errors).length > 0 ? errors : null;
  }

  /** The border turns red with the message, or when an end was edited and is wrong. */
  protected invalid(): boolean {
    const { start, end } = this.range.controls;
    return (
      this.errorMessage() !== null ||
      (start.touched && start.invalid) ||
      (end.touched && end.invalid)
    );
  }

  protected openCalendar(): void {
    if (this.disabled()) {
      return;
    }
    const start = this.startInput();
    const end = this.endInput();
    // A button does not always get the focus when clicked (Safari): the calendar gives the focus
    // back to what had it, and that must be the button when it was the button that opened it
    if (!this.host.contains(this.document.activeElement)) {
      this.toggle().nativeElement.focus({ preventScroll: true });
    }
    // The popup takes the focus while it opens, before there is a ref: that is not leaving the field
    this.opening = true;
    let ref: SsCalendarPopupRef;
    try {
      ref = this.popup.open({
        origin: this.box(),
        mode: 'range',
        range: { start: start.value(), end: end.value() },
        min: this.min(),
        max: this.max(),
      });
    } finally {
      this.opening = false;
    }
    this.popupRef = ref;
    this.popupOpen.set(true);
    // The first pick is the start (a new start clears the old end), the second is the end
    ref.rangeStarted.subscribe((date) => {
      start.set(date);
      end.set(null);
    });
    ref.rangeSelected.subscribe((period) => {
      start.set(period.start);
      end.set(period.end);
    });
    // `closed` also tells at once when the click only closed a popup that was open
    ref.closed.subscribe(() => {
      if (this.popupRef === ref) {
        this.popupRef = null;
        this.popupOpen.set(false);
        this.touchIfFocusLeft();
      }
    });
  }

  /** Touched means focus left the whole field, not just moved from the start date to the end date. */
  protected onFocusOut(event: FocusEvent): void {
    const field = event.currentTarget as HTMLElement;
    if (field.contains(event.relatedTarget as Node | null)) {
      return;
    }
    this.focused.set(false);
    // Focus is in the calendar for now: the field is left when the calendar closes
    if (!this.popupRef && !this.opening) {
      this.onTouched();
    }
  }

  /** The calendar has closed and put the focus somewhere: if that is not in the field, it is left. */
  private touchIfFocusLeft(): void {
    const field = this.box().nativeElement.parentElement;
    const active = field?.ownerDocument.activeElement ?? null;
    if (!field?.contains(active)) {
      this.focused.set(false);
      this.onTouched();
    }
  }

  private order(key: 'startDateInvalid' | 'endDateInvalid'): ValidatorFn {
    return () => {
      const { start, end } = this.range.getRawValue();
      if (isValidDate(start) && isValidDate(end) && compareDays(start, end) > 0) {
        return key === 'startDateInvalid'
          ? { [key]: { end, actual: start } }
          : { [key]: { start, actual: end } };
      }
      return null;
    };
  }

  private revalidateEnds(): void {
    const { start, end } = this.range.controls;
    start.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    end.updateValueAndValidity({ onlySelf: true, emitEvent: false });
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
    if (errors['dateParse']) {
      return 'Enter valid dates';
    }
    if (errors['startDateInvalid'] || errors['endDateInvalid']) {
      return 'Start date must not be after end date';
    }
    if (errors['dateMin'] || errors['dateMax']) {
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
