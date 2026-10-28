import {
  Component,
  computed,
  contentChild,
  Directive,
  DoCheck,
  ElementRef,
  inject,
  InjectionToken,
  input,
  signal,
  Signal,
  ViewEncapsulation,
} from '@angular/core';
import { AbstractControl, FormGroupDirective, NgControl, NgForm, Validators } from '@angular/forms';

let nextId = 0;

/** A new element id, e.g. `ss-field-3`. */
export function uniqueId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

/** What a control must offer to sit inside an {@link SsField}: an input or an `ss-select`. */
export interface SsFormControl {
  readonly id: Signal<string>;
  readonly ngControl: NgControl | null;
  readonly focused: Signal<boolean>;
  /** True when the control is invalid and was touched, or its form was submitted. */
  readonly errorState: Signal<boolean>;
  readonly disabled: Signal<boolean>;
  /** Moves focus to the control, e.g. when its label is clicked. */
  focus(): void;
}

export const SS_FORM_CONTROL = new InjectionToken<SsFormControl>('SS_FORM_CONTROL');

/**
 * Decides when a control shows its error, for a rule the default does not cover, e.g. an error of
 * the whole form shown on one field. Pass one to an input or select with `[errorStateMatcher]`.
 */
export interface SsErrorStateMatcher {
  isErrorState(control: AbstractControl | null, form: NgForm | FormGroupDirective | null): boolean;
}

/** The default rule, the same one Material used: invalid, and touched or the form was submitted. */
export const defaultErrorStateMatcher: SsErrorStateMatcher = {
  isErrorState: (control, form) =>
    !!(control && control.invalid && (control.touched || form?.submitted)),
};

export function hasErrorState(
  ngControl: NgControl | null,
  form: NgForm | FormGroupDirective | null,
  matcher: SsErrorStateMatcher | null = null,
): boolean {
  return (matcher ?? defaultErrorStateMatcher).isErrorState(ngControl?.control ?? null, form);
}

/**
 * A labelled field: a label above, the control in a bordered box, and a hint or an error below.
 *
 * ```html
 * <ss-field>
 *   <ss-label>Email</ss-label>
 *   <input ssInput type="email" formControlName="email" />
 *   <ss-hint>We only use it to sign you in</ss-hint>
 *   @if (form.controls.email.hasError('required')) {
 *     <ss-error>Email is required</ss-error>
 *   }
 * </ss-field>
 * ```
 *
 * An `ss-error` shows (in place of the hint) only when the control was touched or the form was
 * submitted. Put an icon button or a unit in the box with `ssSuffix` or `ssPrefix`.
 */
@Component({
  selector: 'ss-field',
  template: `
    <!-- The * sits next to the label, not inside it, so the label's text stays the label's text -->
    <div class="ss-field__head">
      <ng-content select="ss-label" />
      @if (label() && required()) {
        <span class="ss-field__required" aria-hidden="true">*</span>
      }
    </div>
    <div class="ss-field__box">
      <ng-content select="[ssPrefix]" />
      <ng-content />
      <ng-content select="[ssSuffix]" />
    </div>
    <!-- A live region must exist before its text does, or a screen reader skips the message -->
    <div class="ss-field__sub" [id]="subId" aria-live="polite" aria-atomic="true">
      @if (invalid()) {
        <ng-content select="ss-error" />
      } @else {
        <ng-content select="ss-hint" />
      }
    </div>
  `,
  styleUrl: './field.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-field',
    '[class.ss-field--invalid]': 'invalid()',
    '[class.ss-field--focused]': 'control()?.focused()',
    '[class.ss-field--disabled]': 'control()?.disabled()',
  },
})
export class SsField {
  readonly control = contentChild(SS_FORM_CONTROL);
  protected readonly label = contentChild(SsLabel);
  readonly subId = uniqueId('ss-field-sub');
  readonly labelId = uniqueId('ss-field-label');

  protected invalid(): boolean {
    return this.control()?.errorState() ?? false;
  }

  required(): boolean {
    return this.control()?.ngControl?.control?.hasValidator(Validators.required) ?? false;
  }
}

/** The label of an {@link SsField}. The field shows a * next to it when the control is required. */
@Component({
  selector: 'ss-label',
  template: `
    <label [id]="field.labelId" [attr.for]="field.control()?.id()"><ng-content /></label>
  `,
  encapsulation: ViewEncapsulation.None,
  // A label cannot point `for` at a select (it is not a labelable element), so a click on it
  // moves focus to the control by hand. For an input this repeats what the browser does.
  host: { class: 'ss-field__label', '(click)': 'field.control()?.focus()' },
})
export class SsLabel {
  protected readonly field = inject(SsField);
}

/** An error message of an {@link SsField}. Announced politely by the field's live region. */
@Component({
  selector: 'ss-error',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-field__error' },
})
export class SsError {}

/** A hint of an {@link SsField}, shown while there is no error. */
@Component({
  selector: 'ss-hint',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-field__hint' },
})
export class SsHint {}

/** Content placed before the control inside the box, e.g. an icon. */
@Directive({ selector: '[ssPrefix]' })
export class SsPrefix {}

/** Content placed after the control inside the box, e.g. a "show password" button. */
@Directive({ selector: '[ssSuffix]' })
export class SsSuffix {}

/**
 * The text input (or textarea) of an {@link SsField}. Works with reactive and template forms.
 *
 * ```html
 * <input ssInput formControlName="name" autocomplete="off" />
 * <textarea ssInput formControlName="note" rows="3"></textarea>
 * ```
 */
@Directive({
  selector: 'input[ssInput], textarea[ssInput]',
  providers: [{ provide: SS_FORM_CONTROL, useExisting: SsInput }],
  host: {
    class: 'ss-input',
    '[id]': 'id()',
    '[attr.aria-invalid]': 'errorState()',
    '[attr.aria-required]': 'required()',
    '[attr.aria-describedby]': 'field?.subId',
    '(focus)': 'focused.set(true)',
    '(blur)': 'focused.set(false)',
  },
})
export class SsInput implements SsFormControl, DoCheck {
  readonly ngControl = inject(NgControl, { optional: true, self: true });
  protected readonly field = inject(SsField, { optional: true });
  private readonly form =
    inject(NgForm, { optional: true }) ?? inject(FormGroupDirective, { optional: true });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly generatedId = uniqueId('ss-input');

  /** Set an `id` on the element to override the generated one. */
  readonly idInput = input<string | null>(null, { alias: 'id' });
  readonly id = computed(() => this.idInput() ?? this.generatedId);
  /** A custom rule for when the error shows. Default: invalid and touched, or form submitted. */
  readonly errorStateMatcher = input<SsErrorStateMatcher | null>(null);
  readonly focused = signal(false);
  readonly errorState = signal(false);
  readonly disabled = signal(false);

  ngDoCheck(): void {
    this.errorState.set(hasErrorState(this.ngControl, this.form, this.errorStateMatcher()));
    this.disabled.set(this.ngControl?.disabled ?? false);
  }

  /** True when the control has `Validators.required`. Set as aria-required, not as `required`, so
   * the browser does not validate the form itself. */
  protected required(): boolean {
    return this.ngControl?.control?.hasValidator(Validators.required) ?? false;
  }

  focus(): void {
    this.element.nativeElement.focus();
  }
}
