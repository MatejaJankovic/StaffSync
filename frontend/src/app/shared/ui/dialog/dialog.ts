import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  Component,
  Directive,
  ElementRef,
  inject,
  Injectable,
  input,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { Observable } from 'rxjs';
import { uniqueId } from '../field/field';

/** The data passed to the dialog, read in the dialog component with `inject(SS_DIALOG_DATA)`. */
export const SS_DIALOG_DATA = DIALOG_DATA;

export interface SsDialogConfig<D = unknown> {
  data?: D;
  /** A CSS width such as `'420px'`. The dialog never grows past the screen. */
  width?: string;
  /** Stops Escape and a click outside from closing the dialog. */
  disableClose?: boolean;
  /** Names a dialog that has no `ssDialogTitle`. */
  ariaLabel?: string;
  /** What gets focus on opening. Default: the first control. */
  autoFocus?: 'first-tabbable' | 'first-heading' | 'dialog' | string;
  panelClass?: string | string[];
}

/**
 * A handle on an open dialog: injected into the dialog's own component, and returned by `open()`.
 * It has the shape of Material's `MatDialogRef`, so `close()` and `afterClosed()` work as before.
 */
export class SsDialogRef<T = unknown, R = unknown> {
  constructor(private readonly ref: DialogRef<R, T>) {}

  /** Closes the dialog. `afterClosed()` emits `result`. */
  close(result?: R): void {
    this.ref.close(result);
  }

  /** Emits once, with the result passed to `close()` or `undefined` for Escape or a click outside. */
  afterClosed(): Observable<R | undefined> {
    return this.ref.closed;
  }

  backdropClick(): Observable<MouseEvent> {
    return this.ref.backdropClick;
  }

  keydownEvents(): Observable<KeyboardEvent> {
    return this.ref.keydownEvents;
  }

  get componentInstance(): T | null {
    return this.ref.componentInstance;
  }

  get disableClose(): boolean {
    return this.ref.disableClose ?? false;
  }

  set disableClose(value: boolean) {
    this.ref.disableClose = value;
  }
}

/**
 * Opens a component in a modal dialog: a focus trap, focus returns to the opener on close, and
 * Escape or a click outside close it unless `disableClose` is set.
 *
 * ```ts
 * private readonly dialog = inject(SsDialog);
 *
 * edit(skill: Skill): void {
 *   this.dialog
 *     .open<SkillDialog, SkillDialogData, Skill>(SkillDialog, { data: { skill }, width: '480px' })
 *     .afterClosed()
 *     .pipe(filter(Boolean))
 *     .subscribe(() => this.table().reload());
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SsDialog {
  private readonly dialog = inject(Dialog);

  open<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    config: SsDialogConfig<D> = {},
  ): SsDialogRef<T, R> {
    let ssRef!: SsDialogRef<T, R>;
    this.dialog.open<R, D, T>(component, {
      data: config.data,
      width: config.width,
      maxWidth: '92vw',
      disableClose: config.disableClose,
      ariaLabel: config.ariaLabel,
      // The CDK default is false; a modal dialog must tell screen readers the page behind is inert
      ariaModal: true,
      autoFocus: config.autoFocus ?? 'first-tabbable',
      restoreFocus: true,
      panelClass: ['ss-dialog-panel', ...[config.panelClass ?? []].flat()],
      backdropClass: 'ss-dialog-backdrop',
      providers: (dialogRef) => {
        ssRef = new SsDialogRef<T, R>(dialogRef as DialogRef<R, T>);
        return [{ provide: SsDialogRef, useValue: ssRef }];
      },
    });
    return ssRef;
  }

  /** Closes every open dialog, with no result. */
  closeAll(): void {
    this.dialog.closeAll();
  }
}

/**
 * The title of a dialog. It names the dialog for screen readers.
 *
 * ```html
 * <h2 ssDialogTitle>Edit skill</h2>
 * ```
 */
@Directive({
  selector: '[ssDialogTitle]',
  host: { class: 'ss-dialog__title', '[id]': 'id' },
})
export class SsDialogTitle implements OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly id = uniqueId('ss-dialog-title');

  ngOnInit(): void {
    this.element.nativeElement
      .closest('.cdk-dialog-container')
      ?.setAttribute('aria-labelledby', this.id);
  }
}

/** The scrolling body of a dialog. */
@Component({
  selector: 'ss-dialog-content',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-dialog__content' },
  // Known to the scroll dispatcher: an overlay open over the content (a select, a calendar) follows
  // its field when the content scrolls, and scroll events do not bubble up to the window
  hostDirectives: [CdkScrollable],
})
export class SsDialogContent {}

/**
 * The row of buttons at the bottom of a dialog, at the end by default.
 *
 * ```html
 * <ss-dialog-actions> ... </ss-dialog-actions>
 * <ss-dialog-actions align="start"> ... </ss-dialog-actions>
 * ```
 */
@Component({
  selector: 'ss-dialog-actions',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ss-dialog__actions', '[class]': '"ss-dialog__actions--" + align()' },
})
export class SsDialogActions {
  readonly align = input<'start' | 'center' | 'end'>('end');
}

/**
 * Closes the dialog on click, with an optional result.
 *
 * ```html
 * <button ss-button type="button" [ssDialogClose]="false">Cancel</button>
 * <button ss-button type="button" ssDialogClose>Close</button>
 * ```
 *
 * The button carries a plain `ss-dialog-close` attribute (a binding on `[ssDialogClose]` leaves no
 * attribute behind), so a test or a style can find it with `button[ss-dialog-close]`.
 */
@Directive({
  selector: '[ssDialogClose]',
  host: { '(click)': 'close()', 'ss-dialog-close': '' },
})
export class SsDialogClose {
  private readonly ref = inject(SsDialogRef);

  /** The result `afterClosed()` emits. A bare `ssDialogClose` closes with no result. */
  readonly result = input<unknown>(undefined, { alias: 'ssDialogClose' });

  protected close(): void {
    const result = this.result();
    this.ref.close(result === '' ? undefined : result);
  }
}
