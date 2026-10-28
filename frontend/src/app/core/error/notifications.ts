import { inject, Injectable } from '@angular/core';
import { SsToast } from '../../shared/ui/toast/toast';

/** Snackbar messages, so every page shows them in the same place and for the same time. */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly toast = inject(SsToast);

  error(message: string): void {
    this.toast.open(message, 'Close', {
      duration: 6000,
      politeness: 'assertive',
      panelClass: 'snackbar--error',
    });
  }

  success(message: string): void {
    this.toast.open(message, undefined, { duration: 3000, politeness: 'polite' });
  }
}
