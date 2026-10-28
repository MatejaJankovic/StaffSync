import { Component, forwardRef, input, signal, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * A checkbox with its label, for reactive forms. It is a real `<input type="checkbox">`, so the
 * keyboard, the label click and screen readers work natively.
 *
 * ```html
 * <ss-checkbox formControlName="remote">Remote work</ss-checkbox>
 * ```
 */
@Component({
  selector: 'ss-checkbox',
  template: `
    <label class="ss-checkbox__label">
      <input
        type="checkbox"
        class="ss-checkbox__input"
        [checked]="checked()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        (change)="onInput($event)"
        (blur)="onTouched()"
      />
      <span class="ss-checkbox__text"><ng-content /></span>
    </label>
  `,
  styleUrl: './checkbox.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-checkbox' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SsCheckbox), multi: true },
  ],
})
export class SsCheckbox implements ControlValueAccessor {
  /** Only needed when the checkbox has no text. */
  readonly ariaLabel = input<string | null>(null);

  protected readonly checked = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: boolean | null): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.checked.set(value);
    this.onChange(value);
  }
}
