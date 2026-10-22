import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormControl,
  FormGroupDirective,
  NgForm,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { apiErrorMessage, isApiError } from '../api/api-error';
import { Notifications } from '../error/notifications';
import { AuthService } from './auth.service';

/** The API's code for a wrong current password (T-38). */
const WRONG_PASSWORD = 'WRONG_PASSWORD';

const passwordsMatch: ValidatorFn = (group: AbstractControl) =>
  group.get('newPassword')?.value === group.get('confirmPassword')?.value
    ? null
    : { passwordsMismatch: true };

/** Shows the mismatch, which is an error of the whole form, on the confirmation field. */
class ConfirmPasswordErrorMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const touched = !!control?.touched || !!form?.submitted;
    const mismatch = !!form?.form.hasError('passwordsMismatch') && !!control?.value;
    return touched && (!!control?.invalid || mismatch);
  }
}

/**
 * The *Change password* dialog from the user menu. Shows the API's errors itself, a wrong
 * current password on its field, and closes with a success snackbar once the password is changed.
 */
@Component({
  selector: 'app-change-password-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Change password</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="change-password__content">
        @if (error(); as message) {
          <p class="change-password__error" role="alert">{{ message }}</p>
        }

        <mat-form-field appearance="outline">
          <mat-label>Current password</mat-label>
          <input
            matInput
            type="password"
            formControlName="oldPassword"
            autocomplete="current-password"
          />
          @if (form.controls.oldPassword.hasError('required')) {
            <mat-error>Current password is required</mat-error>
          } @else if (form.controls.oldPassword.hasError('incorrect')) {
            <mat-error>Current password is incorrect</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>New password</mat-label>
          <input
            matInput
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
          />
          @if (form.controls.newPassword.hasError('required')) {
            <mat-error>New password is required</mat-error>
          } @else if (form.controls.newPassword.hasError('minlength')) {
            <mat-error>New password must be at least {{ minLength }} characters</mat-error>
          } @else if (form.controls.newPassword.hasError('maxlength')) {
            <mat-error>New password must be at most {{ maxLength }} characters</mat-error>
          } @else {
            <mat-hint>At least {{ minLength }} characters</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Confirm new password</mat-label>
          <input
            matInput
            type="password"
            formControlName="confirmPassword"
            autocomplete="new-password"
            [errorStateMatcher]="confirmMatcher"
          />
          @if (form.controls.confirmPassword.hasError('required')) {
            <mat-error>Confirm the new password</mat-error>
          } @else if (form.hasError('passwordsMismatch')) {
            <mat-error>Passwords do not match</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Change password</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .change-password__content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }

    .change-password__error {
      margin: 0 0 12px;
      padding: 12px 16px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class ChangePasswordDialog {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(Notifications);
  private readonly dialogRef = inject<MatDialogRef<ChangePasswordDialog, boolean>>(MatDialogRef);

  // Same limits as the API: BCrypt hashes at most 72 characters
  protected readonly minLength = 8;
  protected readonly maxLength = 72;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      oldPassword: ['', Validators.required],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(this.minLength),
          Validators.maxLength(this.maxLength),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly confirmMatcher = new ConfirmPasswordErrorMatcher();
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { oldPassword, newPassword } = this.form.getRawValue();

    this.error.set(null);
    this.saving.set(true);
    // Escape or a click outside would close the dialog before the answer arrives
    this.dialogRef.disableClose = true;

    this.auth.changePassword({ oldPassword, newPassword }).subscribe({
      next: () => {
        this.notifications.success('Password changed');
        this.dialogRef.close(true);
      },
      error: (err: unknown) => {
        this.dialogRef.disableClose = false;
        this.saving.set(false);
        if (
          err instanceof HttpErrorResponse &&
          isApiError(err.error) &&
          err.error.code === WRONG_PASSWORD
        ) {
          this.form.controls.oldPassword.setErrors({ incorrect: true });
        } else {
          this.error.set(apiErrorMessage(err));
        }
      },
    });
  }
}
