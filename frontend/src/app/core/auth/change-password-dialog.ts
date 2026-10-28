import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormGroupDirective,
  NgForm,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { apiErrorMessage, isApiError } from '../api/api-error';
import {
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
  SsIcon,
} from '../../shared/ui';
import type { SsErrorStateMatcher } from '../../shared/ui/field/field';
import { Notifications } from '../error/notifications';
import { AuthService } from './auth.service';

/** The API's code for a wrong current password (T-38). */
const WRONG_PASSWORD = 'WRONG_PASSWORD';

const utf8 = new TextEncoder();

/**
 * BCrypt's limit is in bytes, not characters, so letters such as č or ž count as 2, the same
 * as the API's `@MaxBytes(72)`. `Validators.maxLength` would count them as 1.
 */
function maxBytes(max: number): ValidatorFn {
  return (control) =>
    utf8.encode(String(control.value ?? '')).length > max ? { maxBytes: { max } } : null;
}

const passwordsMatch: ValidatorFn = (group: AbstractControl) =>
  group.get('newPassword')?.value === group.get('confirmPassword')?.value
    ? null
    : { passwordsMismatch: true };

/** Shows the mismatch, which is an error of the whole form, on the confirmation field. */
class ConfirmPasswordErrorMatcher implements SsErrorStateMatcher {
  isErrorState(control: AbstractControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const touched = !!control?.touched || !!form?.submitted;
    const mismatch = !!form?.form.hasError('passwordsMismatch') && !!control?.value;
    return touched && (!!control?.invalid || mismatch);
  }
}

/**
 * The *Change password* dialog from the user menu. Shows the API's errors itself, a wrong
 * current password on its field, and closes with a success toast once the password is changed.
 */
@Component({
  selector: 'app-change-password-dialog',
  imports: [
    ReactiveFormsModule,
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsIcon,
    SsError,
    SsField,
    SsHint,
    SsInput,
    SsLabel,
  ],
  template: `
    <h2 ssDialogTitle>Change password</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="change-password__content">
        @if (error(); as message) {
          <p class="change-password__error ss-notice ss-notice--danger" role="alert">
            <ss-icon class="ss-notice__icon">error</ss-icon>
            <span class="ss-notice__text">{{ message }}</span>
          </p>
        }

        <ss-field>
          <ss-label>Current password</ss-label>
          <input
            ssInput
            type="password"
            formControlName="oldPassword"
            autocomplete="current-password"
          />
          @if (
            form.controls.oldPassword.hasError('required') ||
            form.controls.oldPassword.hasError('pattern')
          ) {
            <ss-error>Current password is required</ss-error>
          } @else if (form.controls.oldPassword.hasError('incorrect')) {
            <ss-error>Current password is incorrect</ss-error>
          }
        </ss-field>

        <ss-field>
          <ss-label>New password</ss-label>
          <input
            ssInput
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
          />
          @if (
            form.controls.newPassword.hasError('required') ||
            form.controls.newPassword.hasError('pattern')
          ) {
            <ss-error>New password is required</ss-error>
          } @else if (form.controls.newPassword.hasError('minlength')) {
            <ss-error>New password must be at least {{ minLength }} characters</ss-error>
          } @else if (form.controls.newPassword.hasError('maxBytes')) {
            <ss-error>New password is too long (at most {{ maxBytes }} bytes)</ss-error>
          } @else {
            <ss-hint>At least {{ minLength }} characters</ss-hint>
          }
        </ss-field>

        <ss-field>
          <ss-label>Confirm new password</ss-label>
          <input
            ssInput
            type="password"
            formControlName="confirmPassword"
            autocomplete="new-password"
            [errorStateMatcher]="confirmMatcher"
          />
          @if (form.controls.confirmPassword.hasError('required')) {
            <ss-error>Confirm the new password</ss-error>
          } @else if (form.hasError('passwordsMismatch')) {
            <ss-error>Passwords do not match</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions>
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Change password</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    // A quiet divider under the title and above the actions
    h2[ssDialogTitle] {
      padding-bottom: var(--ss-space-4);
      border-bottom: 1px solid var(--ss-line);
      letter-spacing: var(--ss-tracking-tight);
    }

    // The form sits between the dialog container and its content, so it passes the height on
    form {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .change-password__content {
      display: flex;
      flex-direction: column;
      padding-top: var(--ss-space-4);
    }

    .change-password__error {
      margin: 0 0 var(--ss-space-3);
    }

    ss-dialog-actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class ChangePasswordDialog {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(Notifications);
  private readonly dialogRef = inject<SsDialogRef<ChangePasswordDialog, boolean>>(SsDialogRef);

  // Same rules as the API: @NotBlank, at least 8 characters and at most 72 bytes (BCrypt)
  protected readonly minLength = 8;
  protected readonly maxBytes = 72;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      oldPassword: ['', [Validators.required, Validators.pattern(/\S/)]],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.pattern(/\S/),
          Validators.minLength(this.minLength),
          maxBytes(this.maxBytes),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly confirmMatcher = new ConfirmPasswordErrorMatcher();
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // An error from the last attempt no longer applies once the user edits the form
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(null));
  }

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
        if (err instanceof HttpErrorResponse && err.status === 401) {
          // The auth interceptor has ended the session and is going to the login page, and
          // SsDialog is a root service, so nothing else would close this dialog
          this.dialogRef.close();
          return;
        }
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
