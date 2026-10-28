import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangeDiff } from '../../shared/change-diff/change-diff';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
  SsError,
  SsField,
  SsHint,
  SsInput,
  SsLabel,
  SsButton,
} from '../../shared/ui';
import { Allocation, PendingApproval, requestedValues } from './allocation.models';
import { AllocationService } from './allocation.service';
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH, textLength } from './allocation.validators';

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
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsField,
    SsLabel,
    SsError,
    SsHint,
    SsInput,
    ChangeDiff,
  ],
  template: `
    <h2 ssDialogTitle>{{ title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <ss-dialog-content class="reject-dialog__content">
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

        <ss-field>
          <ss-label>Comment</ss-label>
          <textarea
            ssInput
            formControlName="comment"
            rows="3"
            placeholder="Fully booked on Project Beta until December"
          ></textarea>
          <ss-hint
            >Tell the project manager why, in at least {{ minCommentLength }} characters</ss-hint
          >
          @if (form.controls.comment.hasError('required')) {
            <ss-error>Comment is required</ss-error>
          } @else if (form.controls.comment.hasError('tooShort')) {
            <ss-error>Comment must be at least {{ minCommentLength }} characters</ss-error>
          } @else if (form.controls.comment.hasError('maxlength')) {
            <ss-error>Comment must be at most {{ maxCommentLength }} characters</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions>
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button
          ss-button="filled"
          type="submit"
          class="reject-dialog__confirm ss-button-danger"
          [disabled]="saving()"
        >
          {{ item.type === 'CHANGE' ? 'Reject change' : 'Reject' }}
        </button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    h2[ssDialogTitle] {
      border-bottom: 1px solid var(--ss-line);
      letter-spacing: var(--ss-tracking-tight);
    }
    form {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }
    .reject-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: var(--ss-space-4);
    }
    .reject-dialog__request {
      margin: 0 0 var(--ss-space-4);
      color: var(--ss-ink-muted);
    }
    .reject-dialog__hint {
      margin: var(--ss-space-3) 0 var(--ss-space-4);
      font: var(--ss-type-body-small);
      color: var(--ss-ink-muted);
    }
    ss-dialog-actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class RejectDialog {
  private readonly allocations = inject(AllocationService);
  private readonly dialogRef = inject<SsDialogRef<RejectDialog, Allocation>>(SsDialogRef);

  protected readonly item = inject<PendingApproval>(SS_DIALOG_DATA);
  protected readonly allocation = this.item.allocation;
  protected readonly after = requestedValues(this.item);
  protected readonly title =
    this.item.type === 'CHANGE'
      ? `Reject the change for ${this.allocation.employeeName}`
      : `Reject ${this.allocation.employeeName}`;

  protected readonly minCommentLength = MIN_TEXT_LENGTH;
  protected readonly maxCommentLength = MAX_TEXT_LENGTH;

  protected readonly form = inject(NonNullableFormBuilder).group({
    comment: ['', [Validators.required, textLength, Validators.maxLength(MAX_TEXT_LENGTH)]],
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
