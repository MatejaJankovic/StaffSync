import { Component, computed, input } from '@angular/core';
import { shortDate } from '../dates';

/** The values of an allocation that a change can touch (BR-15). An allocation itself fits. */
export interface ChangeValues {
  /** 10 to 100, in steps of 10 */
  percent: number;
  /** `yyyy-MM-dd` */
  startDate: string;
  /** `yyyy-MM-dd` */
  endDate: string;
}

/**
 * Old → new for a change to an allocation: the percent and the period, e.g. **60% → 80%** and
 * `1 Nov 2026 – 31 Jan 2027 → 1 Nov 2026 – 28 Feb 2027`. A value that doesn't change is shown once,
 * without an arrow, so what changes stands out.
 *
 * ```html
 * <app-change-diff [before]="allocation" [after]="{ percent: 80, startDate, endDate }" />
 * ```
 */
@Component({
  selector: 'app-change-diff',
  template: `
    <dl class="change-diff">
      <div class="change-diff__row" [class.change-diff__row--changed]="percentChanged()">
        <dt>Allocation</dt>
        <dd>
          @if (percentChanged()) {
            <span class="change-diff__old">{{ before().percent }}%</span>
            <span class="change-diff__arrow" aria-hidden="true"> → </span>
            <span class="change-diff__hidden"> changes to </span>
            <span class="change-diff__new">{{ after().percent }}%</span>
          } @else {
            {{ before().percent }}%
          }
        </dd>
      </div>
      <div class="change-diff__row" [class.change-diff__row--changed]="periodChanged()">
        <dt>Period</dt>
        <dd>
          @if (periodChanged()) {
            <span class="change-diff__old">{{ beforePeriod() }}</span>
            <span class="change-diff__arrow" aria-hidden="true"> → </span>
            <span class="change-diff__hidden"> changes to </span>
            <span class="change-diff__new">{{ afterPeriod() }}</span>
          } @else {
            {{ beforePeriod() }}
          }
        </dd>
      </div>
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }
    .change-diff {
      display: grid;
      gap: var(--ss-space-2);
      margin: 0;
    }
    .change-diff__row {
      display: grid;
      grid-template-columns: 96px 1fr;
      gap: var(--ss-space-3);
      align-items: baseline;
      font: var(--ss-type-body-medium);
      font-variant-numeric: tabular-nums;
      color: var(--ss-ink);
    }
    dt {
      font-size: var(--ss-text-xs);
      font-weight: 500;
      letter-spacing: var(--ss-tracking-label);
      color: var(--ss-ink-muted);
    }
    dd {
      margin: 0;
    }
    .change-diff__old {
      color: var(--ss-ink-muted);
      text-decoration: line-through;
      text-decoration-color: var(--ss-control-border);
    }
    .change-diff__arrow {
      white-space: pre;
      color: var(--ss-ink-muted);
    }
    /* What changes stands out: bold on a sand wash, the "change pending" color */
    .change-diff__new {
      padding: 1px var(--ss-space-2);
      border-radius: var(--ss-radius-sm);
      background: var(--ss-sand-tint);
      color: var(--ss-ink);
      font-weight: 600;
    }
    /* Read out instead of the arrow */
    .change-diff__hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ChangeDiff {
  /** The values in force now. */
  readonly before = input.required<ChangeValues>();
  /** The values the change asks for. */
  readonly after = input.required<ChangeValues>();

  protected readonly percentChanged = computed(
    () => this.before().percent !== this.after().percent,
  );
  protected readonly periodChanged = computed(
    () =>
      this.before().startDate !== this.after().startDate ||
      this.before().endDate !== this.after().endDate,
  );
  protected readonly beforePeriod = computed(() => period(this.before()));
  protected readonly afterPeriod = computed(() => period(this.after()));
}

function period(values: ChangeValues): string {
  return `${shortDate(values.startDate)} – ${shortDate(values.endDate)}`;
}
