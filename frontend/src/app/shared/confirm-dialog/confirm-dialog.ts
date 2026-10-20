import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  /** Default: "Confirm" */
  confirmText?: string;
  /** Default: "Cancel" */
  cancelText?: string;
  /** Shows the confirm button in the error color, e.g. for Cancel allocation or Deactivate. */
  destructive?: boolean;
}

/** Opened through {@link ConfirmDialogService}, not directly. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="confirm-dialog__message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">
        {{ data.cancelText ?? 'Cancel' }}
      </button>
      <button
        mat-flat-button
        type="button"
        class="confirm-dialog__confirm"
        [class.confirm-dialog__confirm--destructive]="data.destructive"
        [mat-dialog-close]="true"
      >
        {{ data.confirmText ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
