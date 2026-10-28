import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  Component,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  ViewEncapsulation,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface SsToastConfig {
  /** How long it stays, in ms. `0` keeps it until dismissed. Default: 4000. */
  duration?: number;
  /** `'assertive'` is announced at once, for errors. Default: `'polite'`. */
  politeness?: 'polite' | 'assertive';
  /** Adds a class to the toast, e.g. `'snackbar--error'` for the error look. */
  panelClass?: string;
}

interface ToastData {
  message: string;
  action: string | null;
  politeness: 'polite' | 'assertive';
  panelClass: string;
  actionTriggered: () => void;
}

const TOAST_DATA = new InjectionToken<ToastData>('SS_TOAST_DATA');

/** A handle on a shown toast. */
export class SsToastRef {
  private readonly dismissed = new Subject<{ dismissedByAction: boolean }>();

  constructor(private readonly overlayRef: OverlayRef) {}

  dismiss(): void {
    this.finish(false);
  }

  /** @internal */
  finish(byAction: boolean): void {
    if (this.overlayRef.hasAttached()) {
      this.overlayRef.dispose();
      this.dismissed.next({ dismissedByAction: byAction });
      this.dismissed.complete();
    }
  }

  afterDismissed(): Observable<{ dismissedByAction: boolean }> {
    return this.dismissed;
  }
}

/** The toast itself: a message and an optional action button. */
@Component({
  selector: 'ss-toast',
  template: `
    <span class="ss-toast__message">{{ data.message }}</span>
    @if (data.action) {
      <button type="button" class="ss-toast__action" (click)="data.actionTriggered()">
        {{ data.action }}
      </button>
    }
  `,
  styleUrl: './toast.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-toast',
    '[class]': 'data.panelClass',
    '[attr.role]': 'data.politeness === "assertive" ? "alert" : "status"',
    '[attr.aria-live]': 'data.politeness',
  },
})
export class SsToastComponent {
  protected readonly data = inject(TOAST_DATA);
}

/**
 * Short messages that disappear by themselves, at the bottom center of the screen. Only one shows
 * at a time: a new one replaces the one on screen.
 *
 * ```ts
 * this.toast.open('Saved', undefined, { duration: 3000 });
 * this.toast.open('Something went wrong', 'Close', { politeness: 'assertive', duration: 6000 });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SsToast {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private current: SsToastRef | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  open(message: string, action?: string, config: SsToastConfig = {}): SsToastRef {
    this.current?.dismiss();
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().global().centerHorizontally().bottom('24px'),
      panelClass: 'ss-toast-pane',
    });
    const ref = new SsToastRef(overlayRef);
    const data: ToastData = {
      message,
      action: action ?? null,
      politeness: config.politeness ?? 'polite',
      panelClass: config.panelClass ?? '',
      actionTriggered: () => ref.finish(true),
    };
    overlayRef.attach(
      new ComponentPortal(
        SsToastComponent,
        null,
        Injector.create({
          providers: [{ provide: TOAST_DATA, useValue: data }],
          parent: this.injector,
        }),
      ),
    );

    const duration = config.duration ?? 4000;
    if (duration > 0) {
      this.timer = setTimeout(() => ref.dismiss(), duration);
    }
    this.current = ref;
    ref.afterDismissed().subscribe(() => {
      if (this.current === ref) {
        this.current = null;
      }
    });
    return ref;
  }

  dismiss(): void {
    this.current?.dismiss();
  }
}
