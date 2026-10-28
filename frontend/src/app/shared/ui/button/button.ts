import { Component, computed, input, ViewEncapsulation } from '@angular/core';

export type SsButtonVariant = 'filled' | 'outlined' | 'text' | 'icon';

/**
 * A button or link styled as one of four variants. The attribute value picks the variant, and a
 * bare `ss-button` is a text button.
 *
 * ```html
 * <button ss-button="filled" type="submit">Save changes</button>
 * <button ss-button="outlined" type="button">Retry</button>
 * <button ss-button type="button">Cancel</button>
 * <button ss-button="icon" type="button" aria-label="Edit"><ss-icon>edit</ss-icon></button>
 * <a ss-button="outlined" routerLink="/projects">Open</a>
 * ```
 *
 * A destructive action adds `class="ss-button-danger"` to a filled, outlined or text button. Icon
 * buttons always need an `aria-label`. A disabled `<a>` is not supported: disable a `<button>` instead.
 */
@Component({
  selector: 'button[ss-button], a[ss-button]',
  template: '<ng-content />',
  styleUrl: './button.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-button',
    '[class]': 'variantClass()',
  },
})
export class SsButton {
  readonly variant = input<SsButtonVariant | ''>('', { alias: 'ss-button' });

  protected readonly variantClass = computed(() => `ss-button--${this.variant() || 'text'}`);
}
