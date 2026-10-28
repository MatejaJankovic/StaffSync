import { ActiveDescendantKeyManager, Highlightable } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
  Overlay,
} from '@angular/cdk/overlay';
import {
  AfterContentInit,
  booleanAttribute,
  Component,
  computed,
  ContentChildren,
  DoCheck,
  ElementRef,
  inject,
  input,
  model,
  OnDestroy,
  output,
  QueryList,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormGroupDirective,
  NgControl,
  NgForm,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
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
 * What `selectionChange` emits, shaped like Material's so `$event.value` keeps working. `any`, like
 * Material's: the select does not know the type of its options, and templates pass the value on
 * to typed signals and controls.
 */
export interface SsSelectChange {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

/** A heading above a group of options. */
@Component({
  selector: 'ss-optgroup',
  template: `
    <span class="ss-optgroup__label" [id]="labelId">{{ label() }}</span>
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-optgroup', role: 'group', '[attr.aria-labelledby]': 'labelId' },
})
export class SsOptgroup {
  readonly label = input('');
  protected readonly labelId = uniqueId('ss-optgroup');
}

/** One choice of an {@link SsSelect}. Its text is what the closed select shows. */
@Component({
  selector: 'ss-option',
  template: `
    <span class="ss-option__text"><ng-content /></span>
    @if (selected()) {
      <!-- An SVG, not a ligature: the option's text stays exactly its label -->
      <svg class="ss-option__check" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
      </svg>
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-option',
    role: 'option',
    '[id]': 'id',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-disabled]': 'disabled',
    '[class.ss-option--active]': 'active()',
    '[class.ss-option--selected]': 'selected()',
    '[class.ss-option--disabled]': 'disabled',
    '(click)': 'choose()',
  },
})
export class SsOption implements Highlightable {
  private readonly select = inject(SsSelect);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly id = uniqueId('ss-option');
  readonly value = input<unknown>(null);
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute });

  protected readonly active = signal(false);

  get disabled(): boolean {
    return this.disabledInput();
  }

  selected(): boolean {
    return this.select.isSelected(this.value());
  }

  /** The text of the option, shown in the closed select. Not the check icon's name ("check"). */
  get viewValue(): string {
    const text = this.element.nativeElement.querySelector('.ss-option__text');
    return (text?.textContent ?? '').trim();
  }

  setActiveStyles(): void {
    this.active.set(true);
    this.element.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  setInactiveStyles(): void {
    this.active.set(false);
  }

  getLabel(): string {
    return this.viewValue;
  }

  protected choose(): void {
    if (!this.disabled) {
      this.select.choose(this);
    }
  }
}

/**
 * A dropdown with one choice. Works with reactive forms, or standalone with `[value]` and
 * `(selectionChange)`. Put it in an `ss-field` to get a label and an error.
 *
 * ```html
 * <ss-field>
 *   <ss-label>Role</ss-label>
 *   <ss-select formControlName="role" placeholder="Choose a role">
 *     @for (role of roles; track role.value) {
 *       <ss-option [value]="role.value">{{ role.label }}</ss-option>
 *     }
 *   </ss-select>
 * </ss-field>
 * ```
 *
 * Keyboard: Arrow Down, Arrow Up, Enter or Space opens it; the arrows, Home, End and typing move
 * through the options; Enter or Space picks; Escape or Tab closes. Focus stays on the select and
 * the active option is announced with `aria-activedescendant`.
 */
@Component({
  selector: 'ss-select',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, SsIcon],
  providers: [{ provide: SS_FORM_CONTROL, useExisting: SsSelect }],
  template: `
    <div
      #trigger
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      class="ss-select__trigger"
      role="combobox"
      aria-haspopup="listbox"
      [id]="id()"
      [attr.tabindex]="disabled() ? -1 : 0"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="isOpen() ? panelId : null"
      [attr.aria-activedescendant]="activeId()"
      [attr.aria-disabled]="disabled()"
      [attr.aria-invalid]="errorState()"
      [attr.aria-required]="required()"
      [attr.aria-labelledby]="field?.labelId"
      [attr.aria-label]="field ? null : ariaLabel()"
      [attr.aria-describedby]="field?.subId"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
      (focus)="focused.set(true)"
      (blur)="onBlur()"
    >
      <span class="ss-select__value" [class.ss-select__placeholder]="!hasValue()">{{
        displayValue()
      }}</span>
      <ss-icon class="ss-select__arrow">expand_more</ss-icon>
    </div>
    <ng-template
      cdkConnectedOverlay
      cdkConnectedOverlayHasBackdrop
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      [cdkConnectedOverlayOrigin]="anchor() ?? origin"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayMinWidth]="triggerWidth()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      (backdropClick)="close()"
      (detach)="close()"
      (attach)="onAttached()"
    >
      <!-- mousedown would move focus off the select, and the select must keep it -->
      <div
        class="ss-select__panel"
        role="listbox"
        [id]="panelId"
        [attr.aria-labelledby]="field?.labelId"
        (mousedown)="$event.preventDefault()"
      >
        <ng-content />
      </div>
    </ng-template>
  `,
  styleUrl: './select.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-select' },
})
export class SsSelect
  implements SsFormControl, ControlValueAccessor, AfterContentInit, DoCheck, OnDestroy
{
  readonly ngControl = inject(NgControl, { optional: true, self: true });
  protected readonly field = inject(SsField, { optional: true });
  private readonly form =
    inject(NgForm, { optional: true }) ?? inject(FormGroupDirective, { optional: true });
  readonly scrollStrategy = inject(Overlay).scrollStrategies.reposition();

  @ContentChildren(SsOption, { descendants: true }) options!: QueryList<SsOption>;
  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');
  private readonly overlay = viewChild(CdkConnectedOverlay);

  readonly idInput = input<string | null>(null, { alias: 'id' });
  readonly placeholder = input('');
  /** A custom rule for when the error shows. Default: invalid and touched, or form submitted. */
  readonly errorStateMatcher = input<SsErrorStateMatcher | null>(null);
  /** Names the select when it is not inside an `ss-field` with a label. */
  readonly ariaLabel = input<string | null>(null);
  /** Compares an option's value with the select's value. Default: `===`. */
  readonly compareWith = input<(a: unknown, b: unknown) => boolean>((a, b) => a === b);
  readonly value = model<unknown>(null);
  readonly selectionChange = output<SsSelectChange>();

  readonly generatedId = uniqueId('ss-select');
  readonly id = computed(() => this.idInput() ?? this.generatedId);
  readonly panelId = uniqueId('ss-select-panel');
  readonly isOpen = signal(false);
  readonly focused = signal(false);
  readonly errorState = signal(false);
  readonly disabled = signal(false);
  readonly triggerWidth = signal(0);
  /** What the open panel lines up with: the field's bordered box, or the trigger outside a field. */
  readonly anchor = signal<ElementRef<HTMLElement> | null>(null);
  readonly activeId = signal<string | null>(null);

  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  private keyManager: ActiveDescendantKeyManager<SsOption> | null = null;
  private keySubscription: Subscription | null = null;
  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Material's own trick: registering as the accessor here, instead of providing
    // NG_VALUE_ACCESSOR, avoids a cycle between NgControl and this component.
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  ngAfterContentInit(): void {
    // The options can change while open (e.g. a list that loads): keep the active one valid.
    this.options.changes.subscribe(() => this.resetKeyManager());
  }

  ngDoCheck(): void {
    this.errorState.set(hasErrorState(this.ngControl, this.form, this.errorStateMatcher()));
  }

  ngOnDestroy(): void {
    this.keySubscription?.unsubscribe();
    this.keyManager?.destroy();
  }

  required(): boolean {
    return this.ngControl?.control?.hasValidator(Validators.required) ?? false;
  }

  focus(): void {
    this.trigger().nativeElement.focus();
  }

  isSelected(optionValue: unknown): boolean {
    return this.compareWith()(optionValue, this.value());
  }

  protected selectedOption(): SsOption | undefined {
    return this.options?.find((option) => this.isSelected(option.value()));
  }

  hasValue(): boolean {
    return this.selectedOption() !== undefined;
  }

  protected displayValue(): string {
    return this.selectedOption()?.viewValue ?? this.placeholder();
  }

  choose(option: SsOption): void {
    const changed = !this.isSelected(option.value());
    this.value.set(option.value());
    if (changed) {
      this.onChange(option.value());
      this.selectionChange.emit({ value: option.value() });
    }
    this.close();
    this.focus();
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Opens the list of options. Same name as Material's `MatSelect.open()`. */
  open(): void {
    if (this.disabled() || this.isOpen()) {
      return;
    }
    const trigger = this.trigger().nativeElement;
    const box = trigger.closest<HTMLElement>('.ss-field__box') ?? trigger;
    this.anchor.set(new ElementRef(box));
    this.triggerWidth.set(box.getBoundingClientRect().width);
    this.isOpen.set(true);
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    // Detached now rather than at the next change detection: until then the transparent backdrop
    // would stay over the page and swallow a click made right after picking an option
    this.overlay()?.overlayRef?.detach();
    this.activeId.set(null);
    this.onTouched();
  }

  /** The panel is in the DOM: now the options can be highlighted and scrolled into view. */
  protected onAttached(): void {
    this.resetKeyManager();
  }

  private resetKeyManager(): void {
    if (!this.isOpen()) {
      return;
    }
    this.keySubscription?.unsubscribe();
    this.keyManager?.destroy();
    this.keyManager = new ActiveDescendantKeyManager(this.options)
      .withTypeAhead()
      .withHomeAndEnd()
      .withWrap();
    this.keySubscription = this.keyManager.change.subscribe(() =>
      this.activeId.set(this.keyManager?.activeItem?.id ?? null),
    );
    const selected = this.options.toArray().findIndex((option) => this.isSelected(option.value()));
    this.keyManager.setActiveItem(selected >= 0 ? selected : 0);
  }

  protected onBlur(): void {
    this.focused.set(false);
    if (!this.isOpen()) {
      this.onTouched();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }
    const key = event.key;
    if (!this.isOpen()) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        this.open();
      }
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (key === 'Tab') {
      this.close();
    } else if ((key === 'Enter' || key === ' ') && !this.keyManager?.isTyping()) {
      event.preventDefault();
      const active = this.keyManager?.activeItem;
      if (active && !active.disabled) {
        this.choose(active);
      }
    } else {
      this.keyManager?.onKeydown(event);
    }
  }

  writeValue(value: unknown): void {
    this.value.set(value);
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
