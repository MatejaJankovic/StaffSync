import { Component, input } from '@angular/core';
import { SsIcon } from '../ui';

/**
 * Warnings that must stand out, e.g. the warnings of a candidate (too little capacity, a missing
 * skill, a different seniority), each with a warning icon, in the warning colors.
 *
 * ```html
 * <app-warning-list [warnings]="candidate.warnings" />
 * ```
 *
 * Hidden when there are no warnings, so a margin set on it by the page doesn't leave a gap.
 */
@Component({
  selector: 'app-warning-list',
  imports: [SsIcon],
  template: `
    <ul aria-label="Warnings">
      @for (warning of warnings(); track $index) {
        <li>
          <ss-icon>warning</ss-icon>
          <span>{{ warning }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    :host([hidden]) {
      display: none;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: var(--ss-space-2) var(--ss-space-3);
      border-radius: var(--ss-radius-md);
      background: var(--ss-sand-tint);
      color: var(--ss-sand);
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--ss-space-2);
      padding: var(--ss-space-1) 0;
      font: var(--ss-type-body-medium);
      font-weight: 500;
    }
    ss-icon {
      flex: none;
      width: 18px;
      height: 18px;
      font-size: 18px;
      /* Lines the icon up with the first line of text (22px line height) */
      margin-top: 2px;
    }
  `,
  host: {
    '[hidden]': '!warnings().length',
  },
})
export class WarningList {
  readonly warnings = input.required<readonly string[]>();
}
