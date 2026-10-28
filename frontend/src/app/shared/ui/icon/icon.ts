import { Component, ViewEncapsulation } from '@angular/core';

/**
 * A Material Symbols icon, named by its text: `<ss-icon>home</ss-icon>`. Decorative by default
 * (hidden from screen readers), so the control around it needs its own name.
 *
 * To give an icon its own name instead, use `<ss-icon role="img" aria-label="Warning">warning</ss-icon>`
 * and remove the hidden state with `aria-hidden="false"`.
 */
@Component({
  selector: 'ss-icon',
  template: '<ng-content />',
  styleUrl: './icon.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-icon material-symbols-outlined',
    'aria-hidden': 'true',
  },
})
export class SsIcon {}
