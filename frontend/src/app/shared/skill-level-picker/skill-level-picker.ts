import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

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
  imports: [MatButtonToggleModule],
  template: `
    <mat-button-toggle-group
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      hideSingleSelectionIndicator
      (change)="select($event.value)"
    >
      @for (level of levels; track level) {
        <mat-button-toggle [value]="level" [aria-label]="'Level ' + level">{{
          level
        }}</mat-button-toggle>
      }
    </mat-button-toggle-group>
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

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

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

  protected select(level: number): void {
    this.value.set(level);
    this.onChange(level);
    this.onTouched();
  }
}
