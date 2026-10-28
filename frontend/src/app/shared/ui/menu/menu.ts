import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Directive } from '@angular/core';

/**
 * A menu opened from a button, built on the CDK menu so the arrow keys, Home, End, typing, Escape
 * and focus return work as in a native app menu.
 *
 * ```html
 * <button ss-button type="button" [ssMenuTriggerFor]="userMenu">Ana Project</button>
 * <ng-template #userMenu>
 *   <div ssMenu aria-label="User menu">
 *     <button ssMenuItem type="button" (click)="logout()">Logout</button>
 *   </div>
 * </ng-template>
 * ```
 */
@Directive({
  selector: '[ssMenuTriggerFor]',
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: ['cdkMenuTriggerFor: ssMenuTriggerFor', 'cdkMenuPosition: ssMenuPosition'],
    },
  ],
})
export class SsMenuTrigger {}

/** The panel of a menu. */
@Directive({
  selector: '[ssMenu]',
  hostDirectives: [CdkMenu],
  host: { class: 'ss-menu' },
})
export class SsMenu {}

/** One action of a menu. Clicking it runs its `(click)` and closes the menu. */
@Directive({
  selector: '[ssMenuItem]',
  hostDirectives: [{ directive: CdkMenuItem, inputs: ['cdkMenuItemDisabled: disabled'] }],
  host: { class: 'ss-menu__item' },
})
export class SsMenuItem {}
