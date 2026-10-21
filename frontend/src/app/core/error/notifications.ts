import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Snackbar messages, so every page shows them in the same place and for the same time. */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly snackBar = inject(MatSnackBar);

  error(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 6000, panelClass: 'snackbar--error' });
  }

  success(message: string): void {
    this.snackBar.open(message, undefined, { duration: 3000 });
  }
}
