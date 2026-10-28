import { booleanAttribute, Component, input, output, ViewEncapsulation } from '@angular/core';
import { SsIcon } from '../icon/icon';

/**
 * A small tag, e.g. a skill. With `removable` it shows a remove button that emits `removed`.
 *
 * ```html
 * <ss-chip>Java</ss-chip>
 * <ss-chip removable (removed)="drop(skill)">Java</ss-chip>
 * ```
 */
@Component({
  selector: 'ss-chip',
  imports: [SsIcon],
  template: `
    <span class="ss-chip__label"><ng-content /></span>
    @if (removable()) {
      <button
        type="button"
        class="ss-chip__remove"
        [attr.aria-label]="removeLabel()"
        (click)="removed.emit()"
      >
        <ss-icon>close</ss-icon>
      </button>
    }
  `,
  styleUrl: './chip.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-chip' },
})
export class SsChip {
  readonly removable = input(false, { transform: booleanAttribute });
  /** Names the remove button, e.g. "Remove Java". */
  readonly removeLabel = input('Remove');
  readonly removed = output<void>();
}
