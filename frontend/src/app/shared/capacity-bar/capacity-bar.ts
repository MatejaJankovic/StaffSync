import { Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export type CapacityTone = 'free' | 'nearly-full' | 'full';

/**
 * Below 80% of the capacity is free, from 80% nearly full, and from 100% full or over (#59). The
 * share is of the employee's own capacity, so 40% for a 50% part-timer is nearly full.
 */
export function capacityTone(load: number, capacity: number): CapacityTone {
  const usage = capacity > 0 ? load / capacity : 1;
  if (usage >= 1) {
    return 'full';
  }
  return usage >= 0.8 ? 'nearly-full' : 'free';
}

/**
 * A load bar (§11): the used part of an employee's capacity, with the numbers in text, e.g.
 * "60% / 100%", so it never relies on color alone. The optional label adds a word, e.g.
 * "Over capacity".
 *
 * ```html
 * <app-capacity-bar [load]="member.load" [capacity]="member.capacityPercent" />
 * <app-capacity-bar [load]="120" [capacity]="100" label="Over capacity" />
 * ```
 */
@Component({
  selector: 'app-capacity-bar',
  imports: [MatProgressBarModule],
  template: `
    <mat-progress-bar mode="determinate" [value]="value()" aria-hidden="true" />
    <span class="capacity-bar__text">
      {{ load() }}% / {{ capacity() }}%
      @if (label()) {
        <span class="capacity-bar__label">{{ label() }}</span>
      }
    </span>
  `,
  styleUrl: './capacity-bar.scss',
  host: {
    class: 'capacity-bar',
    '[class]': '"capacity-bar--" + tone()',
  },
})
export class CapacityBar {
  /** The load in %, e.g. `60`. */
  readonly load = input.required<number>();
  /** The employee's `capacityPercent`, e.g. `100`, `80` or `50`. */
  readonly capacity = input.required<number>();
  readonly label = input<string | null>(null);

  readonly tone = computed(() => capacityTone(this.load(), this.capacity()));

  /** How full the bar is, capped at 100 so an overbooked employee's bar stays in its place. */
  protected readonly value = computed(() => {
    const capacity = this.capacity();
    return capacity > 0 ? Math.min(100, Math.round((this.load() / capacity) * 100)) : 100;
  });
}
