import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  DoCheck,
  effect,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  FormGroupDirective,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  NgControl,
  NgForm,
  ValidationErrors,
  Validator,
  Validators,
} from '@angular/forms';
import { compareDays, isValidDate } from '../../dates';
import { SsButton } from '../button/button';
import { SsCalendarPopup, SsCalendarPopupRef } from '../calendar/calendar-popup';
import { SsDateInput } from '../date-input/date-input';
import {
  SS_FORM_CONTROL,
  SsErrorStateMatcher,
  SsField,
  SsFormControl,
  hasErrorState,
  uniqueId,
} from '../field/field';
import { SsIcon } from '../icon/icon';

/**
 * A date: a text input (typed and shown as `dd/MM/yyyy`) and a button that opens a calendar. Works
 * with reactive forms, and its value is a `Date` at local midnight or `null`. Put it in an
 * `ss-field` to get a label and an error.
 *
 * ```html
 * <ss-field>
 *   <ss-label>Start date</ss-label>
 *   <ss-datepicker formControlName="startDate" [min]="earliest" />
 *   @if (form.controls.startDate.hasError('dateParse')) {
 *     <ss-error>Enter a valid date, like 31/03/2027</ss-error>
 *   }
 * </ss-field>
 * ```
 *
 * The control gets the errors `dateParse` (the text is
 * not a date, or the day does not exist), `dateMin` and `dateMax` (compared by
 * whole days: a date equal to the limit is valid). The calendar greys out days outside `min` and
 * `max`.
 *
 * Keyboard: the text input is the focus target and the calendar button is the next tab stop;
 * Alt+Arrow Down on the input opens the calendar too. The control is touched when focus leaves
 * both of them, not when it moves from one to the other or into the open calendar.
 */
@Component({
  selector: 'ss-datepicker',
  imports: [SsButton, SsDateInput, SsIcon],
  providers: [
    { provide: SS_FORM_CONTROL, useExisting: SsDatepicker },
    // Provided here, unlike in SsSelect: the validator is needed too, and the control (the
    // NgControl) is looked up late, in `ngControl`, so it does not cycle through NG_VALIDATORS
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SsDatepicker), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => SsDatepicker), multi: true },
  ],
  template: `
    <input
      class="ss-input ss-datepicker__input"
      ssDateInput
      autocomplete="off"
      [id]="id()"
      [min]="min()"
      [max]="max()"
      [placeholder]="placeholder()"
      [attr.aria-invalid]="errorState()"
      [attr.aria-required]="required()"
      [attr.aria-describedby]="field?.subId"
      [attr.aria-label]="field ? null : ariaLabel()"
      (keydown)="onKeydown($event)"
    />
    <button
      #toggle
      ss-button="icon"
      type="button"
      class="ss-datepicker__toggle"
      aria-label="Choose date"
      aria-haspopup="dialog"
      [attr.aria-expanded]="popupOpen()"
      [disabled]="disabled()"
      (click)="toggleCalendar()"
    >
      <ss-icon>calendar_today</ss-icon>
    </button>
  `,
  styleUrl: './datepicker.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-datepicker',
    '(focusin)': 'focused.set(true)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class SsDatepicker
  implements
    SsFormControl,
    ControlValueAccessor,
    Validator,
    OnInit,
    AfterViewInit,
    DoCheck,
    OnDestroy
{
  protected readonly field = inject(SsField, { optional: true });
  private readonly form =
    inject(NgForm, { optional: true }) ?? inject(FormGroupDirective, { optional: true });
  private readonly injector = inject(Injector);
  private readonly popup = inject(SsCalendarPopup);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  // Not `required`: the form hands over the first value before the view exists
  private readonly dateInput = viewChild(SsDateInput);
  private readonly toggle = viewChild.required('toggle', { read: ElementRef });

  /** Set an `id` on the element to override the generated one. The label points at the input. */
  readonly idInput = input<string | null>(null, { alias: 'id' });
  /** The earliest date that is valid and can be picked. */
  readonly min = input<Date | null>(null);
  /** The latest date that is valid and can be picked. */
  readonly max = input<Date | null>(null);
  readonly placeholder = input('');
  /** A custom rule for when the error shows. Default: invalid and touched, or form submitted. */
  readonly errorStateMatcher = input<SsErrorStateMatcher | null>(null);
  /** Names the input when it is not inside an `ss-field` with a label. */
  readonly ariaLabel = input<string | null>(null);

  private readonly generatedId = uniqueId('ss-datepicker');
  readonly id = computed(() => this.idInput() ?? this.generatedId);
  readonly focused = signal(false);
  readonly errorState = signal(false);
  readonly disabled = signal(false);
  /** True while the calendar is open. */
  protected readonly popupOpen = signal(false);

  private control: NgControl | null = null;
  private ready = false;
  private popupRef: SsCalendarPopupRef | null = null;
  /** True while the calendar opens: it takes the focus, which is not the focus leaving. */
  private opening = false;
  private value: Date | null = null;
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

  /**
   * The control this one is bound to. Looked up on first use, after the constructor: asking for
   * the `NgControl` while this class is built would go round in a circle, as the control asks for
   * its validators, and this class is one.
   */
  get ngControl(): NgControl | null {
    if (!this.ready) {
      return null;
    }
    return (this.control ??= this.injector.get(NgControl, null, { self: true }));
  }

  ngOnInit(): void {
    this.ready = true;
  }

  ngAfterViewInit(): void {
    // The accessor can be written to before the input exists: hand over what it has been given
    const input = this.dateInput();
    if (!input) {
      return;
    }
    input.registerOnChange((value) => this.onChange(value));
    input.setDisabledState(this.disabled());
    input.writeValue(this.value);
  }

  ngDoCheck(): void {
    this.errorState.set(hasErrorState(this.ngControl, this.form, this.errorStateMatcher()));
  }

  ngOnDestroy(): void {
    this.popupRef?.close();
  }

  required(): boolean {
    return this.ngControl?.control?.hasValidator(Validators.required) ?? false;
  }

  /** Moves focus to the text input, e.g. when the label is clicked. */
  focus(): void {
    this.dateInput()?.focus();
  }

  /** Opens the calendar, or closes it when it is open. Does nothing while disabled. */
  toggleCalendar(): void {
    if (this.disabled()) {
      return;
    }
    // A button does not always get the focus when clicked (Safari): the calendar gives the focus
    // back to what had it, and that must be the button when it was the button that opened it
    if (!this.host.contains(this.document.activeElement)) {
      this.toggle().nativeElement.focus({ preventScroll: true });
    }
    this.openCalendar();
  }

  private openCalendar(): void {
    const input = this.dateInput();
    if (!input) {
      return;
    }
    this.opening = true;
    let ref: SsCalendarPopupRef;
    try {
      ref = this.popup.open({
        origin: this.host.closest<HTMLElement>('.ss-field__box') ?? this.host,
        mode: 'single',
        value: input.value(),
        min: this.min(),
        max: this.max(),
        onSelect: (date) => {
          input.set(date as Date);
          this.onTouched();
        },
      });
    } finally {
      this.opening = false;
    }
    let finished = false;
    let shown = false;
    ref.closed.subscribe(() => {
      finished = true;
      if (shown) {
        this.onCalendarClosed(ref);
      }
    });
    // A popup that is closed already is the click that closed it: the button toggles
    if (!finished) {
      shown = true;
      this.popupRef = ref;
      this.popupOpen.set(true);
    }
  }

  private onCalendarClosed(ref: SsCalendarPopupRef): void {
    if (this.popupRef === ref) {
      this.popupRef = null;
      this.popupOpen.set(false);
    }
    // The calendar gave the focus back to the button. If it is somewhere else, it left the control.
    if (!this.host.contains(this.document.activeElement) && !this.popupRef) {
      this.focused.set(false);
      this.onTouched();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey && event.key === 'ArrowDown' && !this.disabled()) {
      event.preventDefault();
      this.openCalendar();
    }
  }

  /** Touched means focus left the whole control, not just moved from the input to the button. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if ((next instanceof Node && this.host.contains(next)) || this.opening || this.popupRef) {
      return;
    }
    this.focused.set(false);
    this.onTouched();
  }

  writeValue(value: Date | null): void {
    this.value = isValidDate(value) ? value : null;
    this.dateInput()?.writeValue(this.value);
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
    this.disabled.set(disabled);
    this.dateInput()?.setDisabledState(disabled);
    if (disabled) {
      this.popupRef?.close();
    }
  }

  /**
   * The error of the text (not a date) comes from the input. The limits are checked here, not
   * there: the input gets them from this component's view, which does not exist yet when the form
   * first validates a value it was given.
   */
  validate(control: AbstractControl): ValidationErrors | null {
    const input = this.dateInput();
    if (input?.textInvalid()) {
      return input.validate(control);
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
}
