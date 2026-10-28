import {
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * A single-choice group of buttons, e.g. a level from 1 to 5. Works with reactive forms. The value
 * is `null` until one is picked, and picking the chosen one again keeps it.
 *
 * ```html
 * <ss-toggle-group formControlName="level" ariaLabel="Level of Java">
 *   @for (level of levels; track level) {
 *     <ss-toggle [value]="level" [ariaLabel]="'Level ' + level">{{ level }}</ss-toggle>
 *   }
 * </ss-toggle-group>
 * ```
 *
 * It is a radio group: one stop in the tab order (the chosen choice, or the first), and the arrow
 * keys move to the previous or next choice and pick it, as for any radio group.
 */
@Component({
  selector: 'ss-toggle-group',
  template: '<ng-content />',
  styleUrl: './toggle-group.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-toggle-group',
    role: 'radiogroup',
    '[attr.aria-label]': 'ariaLabel()',
    '(keydown)': 'onKeydown($event)',
  },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SsToggleGroup), multi: true },
  ],
})
export class SsToggleGroup implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly ariaLabel = input<string | null>(null);
  /** Emits the picked value, for use without a form control. */
  readonly changed = output<unknown>();

  readonly value = signal<unknown>(null);
  readonly disabled = signal(false);
  /** The choices in order, filled by the toggles themselves. */
  readonly toggles = signal<SsToggle[]>([]);

  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  select(value: unknown): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
    this.changed.emit(value);
  }

  /** The choice that is in the tab order: the chosen one, or the first when none is chosen. */
  isTabStop(toggle: SsToggle): boolean {
    const all = this.toggles();
    const chosen = all.find((t) => t.value() === this.value());
    return (chosen ?? all[0]) === toggle;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || this.disabled()) {
      return;
    }
    const buttons = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button.ss-toggle__button'),
    );
    const from = buttons.indexOf(event.target as HTMLButtonElement);
    if (from < 0) {
      return;
    }
    event.preventDefault();
    const next = (from + step + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  }

  writeValue(value: unknown): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}

/** One choice in an {@link SsToggleGroup}. */
@Component({
  selector: 'ss-toggle',
  template: `
    <button
      type="button"
      role="radio"
      class="ss-toggle__button"
      [attr.aria-checked]="selected()"
      [attr.aria-label]="ariaLabel()"
      [attr.tabindex]="group.isTabStop(this) ? 0 : -1"
      [disabled]="group.disabled()"
      (click)="group.select(value())"
    >
      <ng-content />
    </button>
  `,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-toggle', '[class.ss-toggle--selected]': 'selected()' },
})
export class SsToggle implements OnInit, OnDestroy {
  protected readonly group = inject(SsToggleGroup);

  readonly value = input.required<unknown>();
  readonly ariaLabel = input<string | null>(null);

  protected readonly selected = computed(() => this.group.value() === this.value());

  ngOnInit(): void {
    this.group.toggles.update((all) => [...all, this]);
  }

  ngOnDestroy(): void {
    this.group.toggles.update((all) => all.filter((t) => t !== this));
  }
}
