import { Component, computed, input, ViewEncapsulation } from '@angular/core';

/**
 * A thin progress bar. `determinate` shows `value` (0 to 100); `indeterminate` slides while
 * something loads.
 *
 * ```html
 * <ss-progress-bar mode="indeterminate" aria-label="Loading" />
 * <ss-progress-bar [value]="60" aria-label="60% of capacity" />
 * ```
 *
 * The indicator color is `--ss-progress-color` (teal by default) and the track is
 * `--ss-progress-track`, so a parent can tint it, e.g. by a capacity tone.
 */
@Component({
  selector: 'ss-progress-bar',
  template: '<div class="ss-progress__bar"></div>',
  styleUrl: './progress.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-progress',
    '[class.ss-progress--indeterminate]': 'mode() === "indeterminate"',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'mode() === "determinate" ? clamped() : null',
    '[style.--ss-progress-value.%]': 'clamped()',
  },
})
export class SsProgressBar {
  readonly value = input(0);
  readonly mode = input<'determinate' | 'indeterminate'>('determinate');

  protected readonly clamped = computed(() => Math.max(0, Math.min(100, this.value())));
}

/**
 * A small circular spinner for a pending action, e.g. inside a submit button.
 *
 * ```html
 * <ss-spinner aria-label="Signing in" />
 * ```
 */
@Component({
  selector: 'ss-spinner',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" pathLength="100" />
    </svg>
  `,
  styleUrl: './progress.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-spinner',
    role: 'progressbar',
    '[style.width.px]': 'diameter()',
    '[style.height.px]': 'diameter()',
  },
})
export class SsSpinner {
  readonly diameter = input(24);
}
