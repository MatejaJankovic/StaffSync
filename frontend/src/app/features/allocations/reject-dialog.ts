import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ChangeDiff } from '../../shared/change-diff/change-diff';
import { Allocation, PendingApproval, requestedValues } from './allocation.models';
import { AllocationService } from './allocation.service';

const MIN_COMMENT_LENGTH = 10;
const MAX_COMMENT_LENGTH = 1000;

/** Counted without the surrounding spaces, as on the server, so "  Too short " is too short (BR-6). */
const commentLength: ValidatorFn = (control) => {
  const length = String(control.value ?? '').trim().length;
  if (length === 0) {
    return { required: true };
  }
  return length < MIN_COMMENT_LENGTH ? { tooShort: true } : null;
};

/**
 * The *Reject* dialog on *Pending approvals*: a required comment of at least 10 characters (BR-6,
 * T-14, T-34), checked here before the API checks it again. Rejecting a proposal makes it REJECTED;
 * rejecting a change drops it and the current values stay (BR-15). API errors (400, 403, 409) are
 * shown by the global error snackbar, and the dialog stays open. Closes with the decided allocation.
 */
@Component({
  selector: 'app-reject-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ChangeDiff,
  ],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="reject-dialog__content">
        <p class="reject-dialog__request">
          {{ allocation.requestTitle }} · {{ allocation.projectName }}
        </p>
        <app-change-diff [before]="allocation" [after]="after" />
        <p class="reject-dialog__hint">
          @if (item.type === 'CHANGE') {
            The change is dropped, and {{ allocation.employeeName }} stays at
            {{ allocation.percent }}%.
          } @else {
            The proposal is rejected and can’t be decided again.
          }
        </p>

        <mat-form-field appearance="outline">
          <mat-label>Comment</mat-label>
          <textarea
            matInput
            formControlName="comment"
            rows="3"
            placeholder="Fully booked on Project Beta until December"
          ></textarea>
          <mat-hint
            >Tell the project manager why, in at least {{ minCommentLength }} characters</mat-hint
          >
          @if (form.controls.comment.hasError('required')) {
            <mat-error>Comment is required</mat-error>
          } @else if (form.controls.comment.hasError('tooShort')) {
            <mat-error>Comment must be at least {{ minCommentLength }} characters</mat-error>
          } @else if (form.controls.comment.hasError('maxlength')) {
            <mat-error>Comment must be at most {{ maxCommentLength }} characters</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" class="reject-dialog__confirm" [disabled]="saving()">
          {{ item.type === 'CHANGE' ? 'Reject change' : 'Reject' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .reject-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
    .reject-dialog__request {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 12px;
    }
    .reject-dialog__hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin: 8px 0 16px;
    }
    .reject-dialog__confirm {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class RejectDialog {
  private readonly allocations = inject(AllocationService);
  private readonly dialogRef = inject<MatDialogRef<RejectDialog, Allocation>>(MatDialogRef);

  protected readonly item = inject<PendingApproval>(MAT_DIALOG_DATA);
  protected readonly allocation = this.item.allocation;
  protected readonly after = requestedValues(this.item);
  protected readonly title =
    this.item.type === 'CHANGE'
      ? `Reject the change for ${this.allocation.employeeName}`
      : `Reject ${this.allocation.employeeName}`;

  protected readonly minCommentLength = MIN_COMMENT_LENGTH;
  protected readonly maxCommentLength = MAX_COMMENT_LENGTH;

  protected readonly form = inject(NonNullableFormBuilder).group({
    comment: ['', [commentLength, Validators.maxLength(MAX_COMMENT_LENGTH)]],
  });

  protected readonly saving = signal(false);

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    // Escape or a click outside would close the dialog before the answer arrives, and the page
    // would never learn that the allocation was decided
    this.dialogRef.disableClose = true;
    this.allocations
      .reject(this.allocation.id, { comment: this.form.getRawValue().comment.trim() })
      .subscribe({
        next: (rejected) => this.dialogRef.close(rejected),
        // The global error snackbar has shown the message, so the form only becomes editable again
        error: () => {
          this.dialogRef.disableClose = false;
          this.saving.set(false);
        },
      });
  }
}
