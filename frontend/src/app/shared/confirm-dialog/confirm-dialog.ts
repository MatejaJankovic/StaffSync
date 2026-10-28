import { Component, inject } from '@angular/core';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogTitle,
  SsButton,
} from '../ui';

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
  imports: [SsButton, SsDialogActions, SsDialogClose, SsDialogContent, SsDialogTitle],
  template: `
    <h2 ssDialogTitle>{{ data.title }}</h2>
    <ss-dialog-content>
      <p class="confirm-dialog__message">{{ data.message }}</p>
    </ss-dialog-content>
    <ss-dialog-actions>
      <button ss-button type="button" [ssDialogClose]="false">
        {{ data.cancelText ?? 'Cancel' }}
      </button>
      <button
        ss-button="filled"
        type="button"
        class="confirm-dialog__confirm"
        [class.confirm-dialog__confirm--destructive]="data.destructive"
        [class.ss-button-danger]="data.destructive"
        [ssDialogClose]="true"
      >
        {{ data.confirmText ?? 'Confirm' }}
      </button>
    </ss-dialog-actions>
  `,
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(SS_DIALOG_DATA);
}
