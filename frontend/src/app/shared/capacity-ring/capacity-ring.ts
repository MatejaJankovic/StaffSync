import { Component, computed, input } from '@angular/core';
import { capacityTone } from '../capacity-bar/capacity-bar';

export type CapacityRingSize = 'sm' | 'md' | 'lg';

/** One project's share of the load, in % of a full day (the same unit as `load`). */
export interface CapacityRingSegment {
  label: string;
  percent: number;
}

interface RingArc {
  key: string;
  /** The arc's color class: a tone for the single arc, a tint for a project segment. */
  cls: string;
  /** `stroke-dashoffset` (the arc is drawn with `pathLength="100"` and `stroke-dasharray="100"`). */
  offset: number;
  /** Rotation in degrees. -90 is 12 o'clock, the arc runs clockwise from there. */
  rotation: number;
}

interface LegendItem {
  label: string;
  percent: number;
  tint: number;
}

/** Number of distinct project tints before they repeat. */
const SEGMENT_TINTS = 4;
/** The gap between two project arcs, in % of the circle. */
const SEGMENT_GAP = 0.8;

/** Rounds to a few decimals so no SVG attribute carries floating point noise. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Treats a missing, negative or non-finite number as 0, so no SVG attribute ever becomes `NaN`. */
function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * A capacity ring (§11): the used part of an employee's capacity as a circle, the same measure as
 * `app-capacity-bar` in a more compact form. The full circle is 100% of the employee's OWN
 * capacity, so 40% for a 50% part-timer fills 80% of the ring and is nearly full. A fixed tick at
 * 12 o'clock marks 100%. The load is written in the middle in text, and the host is one image with
 * a text label (e.g. "60% of 100% capacity used"), so it never relies on color alone.
 *
 * ```html
 * <app-capacity-ring [load]="member.load" [capacity]="member.capacityPercent" />
 * <app-capacity-ring [load]="60" [capacity]="100" size="lg" />
 * ```
 *
 * An overbooked employee (load above capacity) keeps a full circle, gets a second outer arc for
 * the excess (up to one extra lap), a danger-colored number and a "!" mark (md and lg also say
 * "Over"). The optional label adds a word to the text label, and `showLabel` also shows it under
 * the ring:
 *
 * ```html
 * <app-capacity-ring [load]="120" [capacity]="100" label="Over capacity" [showLabel]="true" />
 * ```
 *
 * Segments split the arc into one arc per project, each in its own tint of the teal. The text
 * label lists them too (and `lg` shows a legend), so the tints never carry meaning alone:
 *
 * ```html
 * <app-capacity-ring
 *   [load]="80"
 *   [capacity]="100"
 *   [segments]="[{ label: 'Apollo', percent: 50 }, { label: 'Hermes', percent: 30 }]"
 * />
 * ```
 *
 * `decorative` hides the ring from screen readers when a bar or text beside it says the same, and
 * `[showValue]="false"` leaves the middle empty so the figure is not written twice either.
 *
 * `animate` sweeps the arcs in once (the Home page's one orchestrated moment). It is off by
 * default and does nothing when the user prefers reduced motion.
 */
@Component({
  selector: 'app-capacity-ring',
  template: `
    <span class="capacity-ring__stage">
      <svg class="capacity-ring__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="capacity-ring__track" cx="50" cy="50" r="39" />
        @for (arc of arcs(); track arc.key) {
          <circle
            class="capacity-ring__arc"
            [class]="arc.cls"
            [class.ss-ring-sweep]="animate()"
            cx="50"
            cy="50"
            r="39"
            pathLength="100"
            stroke-dasharray="100"
            [attr.stroke-dashoffset]="arc.offset"
            [attr.transform]="'rotate(' + arc.rotation + ' 50 50)'"
          />
        }
        @if (overflowOffset() !== null) {
          <circle
            class="capacity-ring__arc capacity-ring__arc--over"
            [class.ss-ring-sweep]="animate()"
            cx="50"
            cy="50"
            r="46.5"
            pathLength="100"
            stroke-dasharray="100"
            [attr.stroke-dashoffset]="overflowOffset()"
            transform="rotate(-90 50 50)"
          />
        }
        <line class="capacity-ring__tick-halo" x1="50" y1="3" x2="50" y2="18" />
        <line class="capacity-ring__tick" x1="50" y1="3" x2="50" y2="18" />
      </svg>
      @if (showValue()) {
        <span class="capacity-ring__center" aria-hidden="true">
          <span class="capacity-ring__value ss-num">{{ shownLoad() }}%</span>
          @if (size() === 'lg' && !overbooked()) {
            <span class="capacity-ring__sub ss-num">of {{ shownCapacity() }}%</span>
          }
          @if (size() !== 'sm' && overbooked()) {
            <span class="capacity-ring__sub capacity-ring__sub--over">Over</span>
          }
        </span>
      }
      @if (overbooked()) {
        <span class="capacity-ring__flag" aria-hidden="true">!</span>
      }
    </span>
    @if (showLabel() && label()) {
      <span class="capacity-ring__label" aria-hidden="true">{{ label() }}</span>
    }
    @if (size() === 'lg' && legend().length) {
      <ul class="capacity-ring__legend" aria-hidden="true">
        @for (item of legend(); track $index) {
          <li>
            <span
              class="capacity-ring__swatch"
              [class]="'capacity-ring__swatch--' + item.tint"
            ></span>
            <span class="capacity-ring__legend-label">{{ item.label }}</span>
            <span class="capacity-ring__legend-value ss-num">{{ item.percent }}%</span>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './capacity-ring.scss',
  host: {
    class: 'capacity-ring',
    '[class]':
      '"capacity-ring--" + tone() + " capacity-ring--" + size() + (overbooked() ? " capacity-ring--over" : "")',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : ariaLabel()',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
  },
})
export class CapacityRing {
  /** The load in %, e.g. `60`. */
  readonly load = input.required<number>();
  /** The employee's `capacityPercent`, e.g. `100`, `80` or `50`. */
  readonly capacity = input.required<number>();
  /** `sm` is 40px, `md` 72px and `lg` 120px. */
  readonly size = input<CapacityRingSize>('md');
  /** One arc per project. Leave empty for a single arc in the tone's color. */
  readonly segments = input<readonly CapacityRingSegment[]>([]);
  /** A word for the state, e.g. "Over capacity". It is part of the text label. */
  readonly label = input<string | null>(null);
  /** Shows the label under the ring too. */
  readonly showLabel = input(false);
  /** Sweeps the arcs in when the ring appears (Home only). */
  readonly animate = input(false);
  /**
   * Hides the ring from assistive tech. For a ring that sits beside a text equivalent (an
   * `app-capacity-bar`, a name) so the same figure is not read twice.
   */
  readonly decorative = input(false);
  /** Writes the load in the middle. Turn it off for a ring beside a bar that has the numbers. */
  readonly showValue = input(true);

  readonly tone = computed(() => capacityTone(this.safeLoad(), this.safeCapacity()));

  readonly overbooked = computed(() => this.safeLoad() > this.safeCapacity());

  protected readonly shownLoad = computed(() => Math.round(this.safeLoad()));
  protected readonly shownCapacity = computed(() => Math.round(this.safeCapacity()));

  /** The arcs inside the ring, from 12 o'clock clockwise, capped at one lap. */
  protected readonly arcs = computed<RingArc[]>(() => {
    const segments = this.segments().filter((segment) => clean(segment.percent) > 0);
    if (segments.length === 0) {
      const length = Math.min(100, this.share(this.safeLoad()));
      return length > 0 ? [this.arc('load', `capacity-ring__arc--${this.tone()}`, 0, length)] : [];
    }
    const gap = segments.length > 1 ? SEGMENT_GAP : 0;
    const arcs: RingArc[] = [];
    let start = 0;
    segments.forEach((segment, index) => {
      const length = Math.min(100 - start, this.share(clean(segment.percent)));
      if (length > 0) {
        const drawn = Math.max(0.1, length - gap);
        arcs.push(
          this.arc(
            `segment-${index}`,
            `capacity-ring__arc--tint-${index % SEGMENT_TINTS}`,
            start,
            drawn,
          ),
        );
      }
      start += length;
    });
    return arcs;
  });

  /** `stroke-dashoffset` of the outer excess arc, or `null` when the employee is not overbooked. */
  protected readonly overflowOffset = computed(() => {
    if (!this.overbooked()) {
      return null;
    }
    const excess = this.safeLoad() - this.safeCapacity();
    const capacity = this.safeCapacity();
    const length = capacity > 0 ? Math.min(100, (excess / capacity) * 100) : 100;
    return tidy(100 - Math.max(length, 1));
  });

  protected readonly legend = computed<LegendItem[]>(() =>
    this.segments()
      .filter((segment) => clean(segment.percent) > 0)
      .map((segment, index) => ({
        label: segment.label,
        percent: Math.round(clean(segment.percent)),
        tint: index % SEGMENT_TINTS,
      })),
  );

  protected readonly ariaLabel = computed(() => {
    const load = this.shownLoad();
    const capacity = this.shownCapacity();
    let text = `${load}% of ${capacity}% capacity used`;
    if (this.overbooked()) {
      text += `, over capacity by ${Math.round(this.safeLoad() - this.safeCapacity())}%`;
    }
    const parts = this.legend().map((item) => `${item.label} ${item.percent}%`);
    if (parts.length > 0) {
      text += `. ${parts.join(', ')}`;
    }
    const label = this.label();
    return label ? `${text}. ${label}` : text;
  });

  private safeLoad(): number {
    return clean(this.load());
  }

  private safeCapacity(): number {
    return clean(this.capacity());
  }

  /** A load as a share of the ring in %, like the bar: zero capacity counts as a full circle. */
  private share(percent: number): number {
    const capacity = this.safeCapacity();
    if (capacity > 0) {
      return (percent / capacity) * 100;
    }
    return 100;
  }

  private arc(key: string, cls: string, start: number, length: number): RingArc {
    return {
      key,
      cls,
      offset: tidy(100 - length),
      rotation: tidy(-90 + start * 3.6),
    };
  }
}
