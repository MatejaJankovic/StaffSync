import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { SsDialog } from '../ui';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/**
 * Asks the user to confirm an action. Emits `true` for confirm, and `false` for cancel,
 * Escape or a click outside the dialog.
 *
 * ```ts
 * private readonly confirmDialog = inject(ConfirmDialogService);
 *
 * cancel(allocation: Allocation): void {
 *   this.confirmDialog
 *     .confirm({
 *       title: 'Cancel allocation?',
 *       message: `${allocation.employeeName} will be removed from ${allocation.projectName}.`,
 *       confirmText: 'Cancel allocation',
 *       cancelText: 'Keep',
 *       destructive: true,
 *     })
 *     .pipe(filter(Boolean), switchMap(() => this.allocations.cancel(allocation.id)))
 *     .subscribe(() => this.table().reload());
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(SsDialog);

  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '420px' })
      .afterClosed()
      .pipe(map((result) => result === true));
  }
}
