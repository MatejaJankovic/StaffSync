import { FocusTrap, FocusTrapFactory } from '@angular/cdk/a11y';
import { ESCAPE, hasModifierKey } from '@angular/cdk/keycodes';
import { ConnectedPosition, Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Observable, ReplaySubject, Subject, Subscription } from 'rxjs';
import { SsCalendar, SsCalendarPeriod, SsCalendarRange } from './calendar';

/** What {@link SsCalendarPopup.open} needs. */
export interface SsCalendarPopupConfig {
  /** The element the popup hangs below (or above): the toggle button or the field. */
  origin: ElementRef<HTMLElement> | HTMLElement;
  mode: 'single' | 'range';
  /** The marked day in single mode. */
  value?: Date | null;
  /** The marked period in range mode. */
  range?: SsCalendarRange | null;
  min?: Date | null;
  max?: Date | null;
  /** The month shown first. Default: the value, the start of the range, or today. */
  startAt?: Date | null;
  /** Names the dialog. Default: "Choose a date" (single) or "Choose a period" (range). */
  ariaLabel?: string;
  /**
   * Called with the picked day (single) or the complete period (range), just before the popup
   * closes. The same as subscribing to `dateSelected` and `rangeSelected` on the returned ref.
   */
  onSelect?: (selection: Date | SsCalendarPeriod) => void;
}

/**
 * A handle on an open calendar popup. Each stream completes when the popup closes, and `closed`
 * replays, so subscribing late (after an already closed popup) still tells you it is closed.
 */
export class SsCalendarPopupRef {
  private readonly closedSubject = new ReplaySubject<void>(1);
  private readonly dateSubject = new Subject<Date>();
  private readonly rangeSubject = new Subject<SsCalendarPeriod>();
  private readonly startedSubject = new Subject<Date>();

  /** Emits once, when the popup has closed (after a pick, Escape, a click outside, or `close()`). */
  readonly closed: Observable<void> = this.closedSubject.asObservable();
  /** The picked day (single mode). The popup closes right after. */
  readonly dateSelected: Observable<Date> = this.dateSubject.asObservable();
  /** The complete period (range mode), when its end is picked. The popup closes right after. */
  readonly rangeSelected: Observable<SsCalendarPeriod> = this.rangeSubject.asObservable();
  /** The start of a period was picked and the popup stays open for its end (range mode). */
  readonly rangeStarted: Observable<Date> = this.startedSubject.asObservable();

  private closeHandler: () => void = () => undefined;
  private finished = false;

  /** @internal */
  constructor(readonly config: SsCalendarPopupConfig) {}

  /** Closes the popup and gives the focus back to the element that had it. Does nothing if closed. */
  close(): void {
    this.closeHandler();
  }

  /** @internal */
  bind(closeHandler: () => void): void {
    this.closeHandler = closeHandler;
  }

  /** @internal */
  pickDate(date: Date): void {
    this.dateSubject.next(date);
    this.config.onSelect?.(date);
    this.close();
  }

  /** @internal */
  pickPeriod(period: SsCalendarPeriod): void {
    this.rangeSubject.next(period);
    this.config.onSelect?.(period);
    this.close();
  }

  /** @internal */
  startPeriod(start: Date): void {
    this.startedSubject.next(start);
  }

  /** @internal */
  finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.closedSubject.next();
    this.closedSubject.complete();
    this.dateSubject.complete();
    this.rangeSubject.complete();
    this.startedSubject.complete();
  }
}

const POPUP_REF = new InjectionToken<SsCalendarPopupRef>('SS_CALENDAR_POPUP_REF');

/** The content of the overlay: a dialog around the calendar. */
@Component({
  selector: 'ss-calendar-popup',
  imports: [SsCalendar],
  template: `
    <ss-calendar
      [mode]="ref.config.mode"
      [value]="ref.config.value"
      [range]="ref.config.range"
      [min]="ref.config.min"
      [max]="ref.config.max"
      [startAt]="ref.config.startAt"
      (dateSelected)="ref.pickDate($event)"
      (rangeSelected)="ref.pickPeriod($event)"
      (rangeStarted)="ref.startPeriod($event)"
    />
  `,
  styleUrl: './calendar.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ss-calendar-popup',
    role: 'dialog',
    '[attr.aria-label]': 'label',
  },
})
class SsCalendarPopupContent {
  protected readonly ref = inject(POPUP_REF);
  protected readonly label =
    this.ref.config.ariaLabel ??
    (this.ref.config.mode === 'range' ? 'Choose a period' : 'Choose a date');
  private readonly calendar = viewChild.required(SsCalendar);

  focusDay(): void {
    // The popup is not positioned yet: focusing must not scroll the page to where it is for now
    this.calendar().focusActiveDay({ preventScroll: true });
  }
}

const POSITIONS: ConnectedPosition[] = [
  // Below, left edges together; or above; and the same hanging off the right edge of the origin
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/**
 * Opens {@link SsCalendar} in a popup on the CDK overlay, below the origin (above when there is no
 * room): the date pickers use it from their toggle button.
 *
 * ```ts
 * private readonly calendar = inject(SsCalendarPopup);
 *
 * openCalendar(toggle: HTMLElement): void {
 *   this.calendar
 *     .open({ origin: toggle, mode: 'single', value: this.date(), min: this.min() })
 *     .dateSelected.subscribe((date) => this.date.set(date));
 * }
 * ```
 *
 * Focus moves to the picked day, the start of the period, or today, and stays inside the popup
 * (Tab goes round). Escape, a click outside, and picking the last needed day (the day in single
 * mode, the end in range mode) close it, and focus returns to the element that had it. One popup
 * is open at a time: opening another closes the first.
 *
 * A click on the origin while the popup is open is a click outside, and closes it. The same click
 * reaches the toggle's own handler, which calls `open()`: that call is ignored (it returns a ref
 * that is already closed), so the toggle opens and closes the popup without extra code.
 */
@Injectable({ providedIn: 'root' })
export class SsCalendarPopup {
  private readonly overlay = inject(Overlay);
  private readonly focusTrapFactory = inject(FocusTrapFactory);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  private current: {
    ref: SsCalendarPopupRef;
    returnTo: HTMLElement;
    contains: (element: Element) => boolean;
  } | null = null;
  private clickedOrigin: HTMLElement | null = null;

  open(config: SsCalendarPopupConfig): SsCalendarPopupRef {
    const origin =
      config.origin instanceof ElementRef ? config.origin.nativeElement : config.origin;
    const ref = new SsCalendarPopupRef(config);

    if (this.clickedOrigin === origin) {
      // This is the click on the toggle that has just closed the popup: stay closed
      ref.finish();
      return ref;
    }

    // Where the focus goes back to: the element that has it now, or, when the popup being replaced
    // has it, where that popup would have sent it
    const focused = this.focusedElement();
    const returnTo =
      (focused && this.current?.contains(focused) ? this.current.returnTo : focused) ?? origin;
    this.current?.ref.close();

    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(origin)
        .withPositions(POSITIONS)
        .withFlexibleDimensions(true)
        .withPush(true)
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'ss-calendar-overlay',
    });

    const subscriptions = new Subscription();
    let focusTrap: FocusTrap | null = null;
    let closed = false;
    const close = (restoreFocus: boolean) => {
      if (closed) {
        return;
      }
      closed = true;
      subscriptions.unsubscribe();
      focusTrap?.destroy();
      // Give the focus back only if it is still ours: in the popup, or nowhere (the click landed
      // on plain page). A click on another field has put it there, and it stays.
      const active = this.focusedElement();
      const focusIsOurs = !active || overlayRef.overlayElement.contains(active);
      overlayRef.dispose();
      if (this.current?.ref === ref) {
        this.current = null;
      }
      if (restoreFocus && focusIsOurs && returnTo.isConnected) {
        returnTo.focus({ preventScroll: true });
      }
      ref.finish();
    };
    ref.bind(() => close(true));
    this.current = {
      ref,
      returnTo,
      contains: (element) => overlayRef.overlayElement.contains(element),
    };

    const componentRef = overlayRef.attach(
      new ComponentPortal(
        SsCalendarPopupContent,
        null,
        Injector.create({
          providers: [{ provide: POPUP_REF, useValue: ref }],
          parent: this.injector,
        }),
      ),
    );
    // Render now, so the day to focus exists before this call returns
    componentRef.changeDetectorRef.detectChanges();
    // Place it now that it has its size. The CDK's own first placement waits for the zone to be
    // stable, which an app without zone.js never reports, so without this the popup would sit at
    // the top-left corner of the page until something else (a resize, a scroll) moved it.
    // No unit test: jsdom has no layout and the test zone makes the CDK place it anyway, so a spec
    // passes with or without this call. It was found and checked in a real browser.
    overlayRef.updatePosition();
    afterNextRender(() => overlayRef.updatePosition(), { injector: this.injector });
    focusTrap = this.focusTrapFactory.create(componentRef.location.nativeElement);
    componentRef.instance.focusDay();

    subscriptions.add(
      overlayRef.keydownEvents().subscribe((event) => {
        if (event.keyCode === ESCAPE && !hasModifierKey(event)) {
          event.preventDefault();
          close(true);
        }
      }),
    );
    subscriptions.add(
      overlayRef.outsidePointerEvents().subscribe((event) => {
        const target = event.target;
        if (
          event.type === 'click' &&
          target instanceof Element &&
          target.classList.contains('cdk-overlay-backdrop')
        ) {
          // The backdrop of a dialog the popup was opened from: this click only closes the popup.
          // This listener runs in the capture phase, so the backdrop's own never gets the click
          // and the dialog stays open with what was typed in it.
          event.stopPropagation();
          event.preventDefault();
        }
        if (target instanceof Node && origin.contains(target)) {
          this.clickedOrigin = origin;
          // The click goes on to the toggle in this very task; once it is over, a click opens again
          setTimeout(() => {
            if (this.clickedOrigin === origin) {
              this.clickedOrigin = null;
            }
          });
        }
        close(true);
      }),
    );

    return ref;
  }

  private focusedElement(): HTMLElement | null {
    const active = this.document.activeElement;
    return active instanceof HTMLElement && active !== this.document.body ? active : null;
  }
}
