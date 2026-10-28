import { TestBed } from '@angular/core/testing';
import { SsToast } from './toast';

describe('SsToast', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    TestBed.inject(SsToast).dismiss();
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  function toasts(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.ss-toast'));
  }

  function open(...args: Parameters<SsToast['open']>) {
    const ref = TestBed.inject(SsToast).open(...args);
    TestBed.tick();
    return ref;
  }

  it('shows the message politely, with no button when there is no action', () => {
    open('Saved');
    const [toast] = toasts();

    expect(toast.textContent).toContain('Saved');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.querySelector('button')).toBeNull();
  });

  it('announces an error at once, and carries the error class', () => {
    open('Something went wrong', 'Close', {
      politeness: 'assertive',
      panelClass: 'snackbar--error',
    });
    const [toast] = toasts();

    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('aria-live')).toBe('assertive');
    expect(toast.classList).toContain('snackbar--error');
  });

  it('disappears by itself after its duration', () => {
    const ref = open('Saved', undefined, { duration: 3000 });
    const dismissed = vi.fn();
    ref.afterDismissed().subscribe(dismissed);

    vi.advanceTimersByTime(2999);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(toasts()).toHaveLength(0);
    expect(dismissed).toHaveBeenCalledWith({ dismissedByAction: false });
  });

  it('stays until dismissed when the duration is 0', () => {
    const ref = open('Pinned', 'Close', { duration: 0 });

    vi.advanceTimersByTime(60_000);
    expect(toasts()).toHaveLength(1);

    ref.dismiss();
    expect(toasts()).toHaveLength(0);
  });

  it('closes with the action button and says it was the action', () => {
    const ref = open('Deleted', 'Undo');
    const dismissed = vi.fn();
    ref.afterDismissed().subscribe(dismissed);

    toasts()[0].querySelector('button')!.click();

    expect(toasts()).toHaveLength(0);
    expect(dismissed).toHaveBeenCalledWith({ dismissedByAction: true });
  });

  it('shows only one at a time: a new toast replaces the one on screen, with its own timer', () => {
    open('First', undefined, { duration: 1000 });
    open('Second', undefined, { duration: 5000 });

    expect(toasts().map((t) => t.textContent!.trim())).toEqual(['Second']);

    vi.advanceTimersByTime(1000); // the first toast's timer must not close the second
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(toasts()).toHaveLength(0);
  });
});
