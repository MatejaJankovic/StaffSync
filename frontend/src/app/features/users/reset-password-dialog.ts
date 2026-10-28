import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SS_DIALOG_DATA,
  SsButton,
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
} from '../../shared/ui';
import { fullName, UserAccount } from './user.models';
import { UserService } from './user.service';

/** Pass the user who forgot their password. Closes with the user once the password is reset. */
export interface ResetPasswordDialogData {
  user: UserAccount;
}

/**
 * The Admin's *Reset password* dialog, for a user who forgot theirs: a new temporary password,
 * which the Admin passes on. The user has to replace it with their own at the next login. API
 * errors are shown by the global error snackbar, and the dialog stays open.
 */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [
    ReactiveFormsModule,
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsError,
    SsField,
    SsHint,
    SsInput,
    SsLabel,
  ],
  template: `
    <h2 ssDialogTitle>Reset password for {{ name }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="reset-password__content">
        <p class="reset-password__intro">
          Give {{ name }} a new temporary password. They will have to choose their own the next time
          they log in.
        </p>
        <ss-field>
          <ss-label>Temporary password</ss-label>
          <input ssInput formControlName="temporaryPassword" autocomplete="new-password" />
          <ss-hint>8 to 72 characters</ss-hint>
          @if (form.controls.temporaryPassword.hasError('required')) {
            <ss-error>Temporary password is required</ss-error>
          } @else if (
            form.controls.temporaryPassword.hasError('minlength') ||
            form.controls.temporaryPassword.hasError('maxlength')
          ) {
            <ss-error>Temporary password must be 8 to 72 characters</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions class="reset-password__actions">
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Reset password</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    form {
      display: contents;
    }
    .reset-password__content {
      display: flex;
      flex-direction: column;
    }
    .reset-password__intro {
      margin: 0 0 var(--ss-space-4);
      color: var(--ss-ink-muted);
    }
    .reset-password__actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class ResetPasswordDialog {
  private readonly users = inject(UserService);
  private readonly dialogRef = inject<SsDialogRef<ResetPasswordDialog, UserAccount>>(SsDialogRef);
  private readonly user = inject<ResetPasswordDialogData>(SS_DIALOG_DATA).user;

  protected readonly name = fullName(this.user);

  protected readonly form = inject(NonNullableFormBuilder).group({
    temporaryPassword: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    ],
  });

  protected readonly saving = signal(false);

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.dialogRef.disableClose = true;
    this.users.resetPassword(this.user.id, this.form.getRawValue().temporaryPassword).subscribe({
      next: (user) => this.dialogRef.close(user),
      error: () => {
        this.dialogRef.disableClose = false;
        this.saving.set(false);
      },
    });
  }
}
