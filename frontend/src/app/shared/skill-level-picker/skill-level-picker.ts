import { Component, effect, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SsToggle, SsToggleGroup } from '../ui';

/** Skill levels from 1 to 5 (§5). */
export const SKILL_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * Picks a skill level from 1 to 5. Works with reactive forms like any other control.
 *
 * ```html
 * <app-skill-level-picker formControlName="level" ariaLabel="Level of Java" />
 * ```
 *
 * The value is `null` until a level is picked.
 */
@Component({
  selector: 'app-skill-level-picker',
  imports: [SsToggleGroup, SsToggle],
  template: `
    <ss-toggle-group [ariaLabel]="ariaLabel()" (changed)="select($any($event))">
      @for (level of levels; track level) {
        <ss-toggle
          class="skill-level-picker__level"
          [class.skill-level-picker__level--filled]="reached(level)"
          [value]="level"
          [ariaLabel]="'Level ' + level"
          >{{ level }}</ss-toggle
        >
      }
    </ss-toggle-group>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    /* A scale, not five separate buttons: every level up to the picked one is tinted and the
       picked one is solid teal (the toggle's default selected look). The number is always visible. */
    .skill-level-picker__level--filled {
      --ss-toggle-bg: var(--ss-teal-tint);
      --ss-toggle-fg: var(--ss-ink);
    }
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SkillLevelPicker),
      multi: true,
    },
  ],
})
export class SkillLevelPicker implements ControlValueAccessor {
  /** Read by screen readers for the whole group, e.g. "Level of Java". */
  readonly ariaLabel = input('Skill level');

  protected readonly levels = SKILL_LEVELS;
  protected readonly value = signal<number | null>(null);
  protected readonly disabled = signal(false);

  private readonly group = viewChild(SsToggleGroup);

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // The toggle group keeps its own value and disabled state; this component stays the one
    // control that the form talks to and mirrors both into it.
    effect(() => {
      const group = this.group();
      if (!group) {
        return;
      }
      group.writeValue(this.value());
      group.setDisabledState(this.disabled());
    });
  }

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** Levels up to the picked one read as filled. */
  protected reached(level: number): boolean {
    const value = this.value();
    return value !== null && level <= value;
  }

  protected select(level: number): void {
    this.value.set(level);
    this.onChange(level);
    this.onTouched();
  }
}
