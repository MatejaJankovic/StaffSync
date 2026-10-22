import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

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
  imports: [MatIconModule],
  template: `
    <ul aria-label="Warnings">
      @for (warning of warnings(); track $index) {
        <li>
          <mat-icon>warning</mat-icon>
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
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--app-warning-container);
      color: var(--app-on-warning-container);
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 2px 0;
      font: var(--mat-sys-body-medium);
    }
    mat-icon {
      flex: none;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
  host: {
    '[hidden]': '!warnings().length',
  },
})
export class WarningList {
  readonly warnings = input.required<readonly string[]>();
}
