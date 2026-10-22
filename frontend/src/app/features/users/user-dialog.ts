import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, Signal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { apiErrorMessage, isApiError } from '../../core/api/api-error';
import { Role, ROLE_LABELS } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { shortDate } from '../../shared/dates';
import { Department } from '../departments/department.models';
import { Seniority, SENIORITY_LABELS } from '../profile/profile.models';
import {
  CAPACITY_OPTIONS,
  fullName,
  isOverloadedDay,
  OverloadedDay,
  ROLES,
  UpdateUserRequest,
  UserAccount,
  UserRef,
} from './user.models';
import { UserService } from './user.service';

/** The API rejects control characters (newlines, tabs, ...) in a name, so it is caught before sending. */
const noControlChars: ValidatorFn = (control) =>
  /\p{Cc}/u.test(String(control.value ?? '')) ? { controlChars: true } : null;

/** BCrypt hashes at most 72 bytes, and an accented letter like "č" takes 2 of them in UTF-8. */
const maxPasswordBytes: ValidatorFn = (control) =>
  new TextEncoder().encode(String(control.value ?? '')).length > 72 ? { maxBytes: true } : null;

/** Enough of the BR-13 days to see the problem; the rest is a count. */
const MAX_DAYS_SHOWN = 5;

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

interface FieldViolation {
  field: string;
  message: string;
}

function isFieldViolation(detail: unknown): detail is FieldViolation {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    typeof (detail as FieldViolation).field === 'string' &&
    typeof (detail as FieldViolation).message === 'string'
  );
}

/**
 * Pass the user to edit, or none to create one, and the departments for the dropdown. They are a
 * signal, so the dropdown fills in if the dialog is opened before they have loaded.
 */
export interface UserDialogData {
  user?: UserAccount;
  departments: Signal<Department[]>;
}

/**
 * The *Create user* / *Edit user* dialog. Field errors from the API are shown next to their field,
 * a lower capacity that existing allocations would exceed (BR-13) lists the days, and anything
 * else goes to the error snackbar. Closes with the saved user.
 */
@Component({
  selector: 'app-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ user ? 'Edit user' : 'Create user' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="user-dialog__content">
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email" type="email" autocomplete="off" />
          @if (form.controls.email.hasError('required')) {
            <mat-error>Email is required</mat-error>
          } @else if (form.controls.email.hasError('email')) {
            <mat-error>Email must be a valid email address</mat-error>
          } @else if (form.controls.email.hasError('maxlength')) {
            <mat-error>Email must be at most 255 characters</mat-error>
          } @else if (form.controls.email.hasError('server')) {
            <mat-error>{{ form.controls.email.getError('server') }}</mat-error>
          }
        </mat-form-field>

        <div class="user-dialog__row">
          <mat-form-field appearance="outline">
            <mat-label>First name</mat-label>
            <input matInput formControlName="firstName" />
            <mat-error>{{ nameError(form.controls.firstName, 'First name') }}</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Last name</mat-label>
            <input matInput formControlName="lastName" />
            <mat-error>{{ nameError(form.controls.lastName, 'Last name') }}</mat-error>
          </mat-form-field>
        </div>

        <div class="user-dialog__row">
          <mat-form-field appearance="outline">
            <mat-label>Role</mat-label>
            <mat-select formControlName="role">
              @for (role of roles; track role) {
                <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
              }
            </mat-select>
            @if (ownAccount) {
              <mat-hint>You can’t change your own role</mat-hint>
            }
            @if (form.controls.role.hasError('server')) {
              <mat-error>{{ form.controls.role.getError('server') }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Department</mat-label>
            <mat-select formControlName="departmentId">
              @if (!isEmployee()) {
                <mat-option [value]="null">None</mat-option>
              }
              @for (department of departments(); track department.id) {
                <mat-option [value]="department.id">{{ department.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.departmentId.hasError('required')) {
              <mat-error>An employee needs a department</mat-error>
            } @else if (form.controls.departmentId.hasError('server')) {
              <mat-error>{{ form.controls.departmentId.getError('server') }}</mat-error>
            }
          </mat-form-field>
        </div>

        @if (isEmployee()) {
          <mat-form-field appearance="outline">
            <mat-label>Resource manager</mat-label>
            <mat-select formControlName="managerId">
              @for (rm of managers(); track rm.id) {
                <mat-option [value]="rm.id">{{ fullName(rm) }}</mat-option>
              }
            </mat-select>
            @if (form.controls.managerId.hasError('required')) {
              <mat-error>An employee needs a resource manager</mat-error>
            } @else if (form.controls.managerId.hasError('server')) {
              <mat-error>{{ form.controls.managerId.getError('server') }}</mat-error>
            }
          </mat-form-field>
        }

        <div class="user-dialog__row">
          <mat-form-field appearance="outline">
            <mat-label>Seniority</mat-label>
            <mat-select formControlName="seniority">
              <mat-option [value]="null">None</mat-option>
              @for (seniority of seniorities; track seniority) {
                <mat-option [value]="seniority">{{ seniorityLabels[seniority] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Capacity</mat-label>
            <mat-select formControlName="capacityPercent">
              @for (capacity of capacities; track capacity) {
                <mat-option [value]="capacity">{{ capacity }}%</mat-option>
              }
            </mat-select>
            @if (form.controls.capacityPercent.hasError('server')) {
              <mat-error>{{ form.controls.capacityPercent.getError('server') }}</mat-error>
            }
          </mat-form-field>
        </div>

        @if (conflict(); as conflict) {
          <div class="user-dialog__conflict" role="alert">
            <p>{{ conflict.message }}</p>
            @if (conflict.days.length > 0) {
              <ul>
                @for (day of conflict.days.slice(0, maxDaysShown); track day.date) {
                  <li>{{ formatDay(day.date) }}: {{ day.load }}% allocated</li>
                }
              </ul>
              @if (conflict.days.length > maxDaysShown) {
                @let more = conflict.days.length - maxDaysShown;
                <p>and {{ more }} more {{ more === 1 ? 'day' : 'days' }}.</p>
              }
            }
          </div>
        }

        @if (!user) {
          <mat-form-field appearance="outline">
            <mat-label>Temporary password</mat-label>
            <input
              matInput
              formControlName="temporaryPassword"
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="new-password"
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              (click)="showPassword.set(!showPassword())"
            >
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Share it with the user. They change it after logging in.</mat-hint>
            @if (form.controls.temporaryPassword.hasError('required')) {
              <mat-error>Temporary password is required</mat-error>
            } @else if (
              form.controls.temporaryPassword.hasError('minlength') ||
              form.controls.temporaryPassword.hasError('maxlength')
            ) {
              <mat-error>Temporary password must be 8 to 72 characters</mat-error>
            } @else if (form.controls.temporaryPassword.hasError('maxBytes')) {
              <mat-error>
                Temporary password must be at most 72 bytes (an accented letter counts as 2)
              </mat-error>
            } @else if (form.controls.temporaryPassword.hasError('server')) {
              <mat-error>{{ form.controls.temporaryPassword.getError('server') }}</mat-error>
            }
          </mat-form-field>
          <button
            mat-button
            type="button"
            class="user-dialog__generate"
            (click)="generatePassword()"
          >
            <mat-icon>password</mat-icon>
            Generate password
          </button>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          {{ user ? 'Save' : 'Create' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .user-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }

    .user-dialog__row {
      display: flex;
      gap: 12px;

      mat-form-field {
        flex: 1;
        min-width: 0;
      }
    }

    .user-dialog__generate {
      align-self: flex-start;
      margin: 8px 0 4px;
    }

    .user-dialog__conflict {
      margin-bottom: 16px;
      padding: 8px 12px;
      border-radius: 8px;
      color: var(--mat-sys-on-error-container);
      background: var(--mat-sys-error-container);

      p,
      ul {
        margin: 4px 0;
      }
    }
  `,
})
export class UserDialog implements OnInit {
  private readonly users = inject(UserService);
  private readonly notifications = inject(Notifications);
  private readonly dialogRef = inject<MatDialogRef<UserDialog, UserAccount>>(MatDialogRef);
  private readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);

  protected readonly user = this.data.user;
  /** The API refuses to change your own role (409), so that there is always an Admin left. */
  protected readonly ownAccount =
    this.user !== undefined && this.user.id === inject(AuthService).currentUser()?.id;
  protected readonly departments = this.data.departments;
  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly seniorities = Object.keys(SENIORITY_LABELS) as Seniority[];
  protected readonly seniorityLabels = SENIORITY_LABELS;
  protected readonly capacities = CAPACITY_OPTIONS;
  protected readonly maxDaysShown = MAX_DAYS_SHOWN;
  protected readonly fullName = fullName;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [
      this.user?.email ?? '',
      [Validators.required, Validators.email, Validators.maxLength(255)],
    ],
    firstName: [this.user?.firstName ?? '', nameValidators()],
    lastName: [this.user?.lastName ?? '', nameValidators()],
    role: [this.user?.role ?? ('EMPLOYEE' as Role), Validators.required],
    departmentId: [this.user?.department?.id ?? (null as number | null)],
    managerId: [this.user?.manager?.id ?? (null as number | null)],
    seniority: [this.user?.seniority ?? (null as Seniority | null)],
    capacityPercent: [this.user?.capacityPercent ?? 100, Validators.required],
    temporaryPassword: [
      '',
      this.user
        ? []
        : [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(72),
            maxPasswordBytes,
          ],
    ],
  });

  private readonly role = toSignal(this.form.controls.role.valueChanges, {
    initialValue: this.form.controls.role.value,
  });

  private readonly activeManagers = signal<UserAccount[]>([]);
  /**
   * The active RMs, without the user being edited (nobody is their own RM), and with their current
   * manager, who may have been deactivated since. The API accepts keeping them.
   */
  protected readonly managers = computed(() => {
    const managers: UserRef[] = this.activeManagers().filter((rm) => rm.id !== this.user?.id);
    const current = this.user?.manager;
    if (current && !managers.some((rm) => rm.id === current.id)) {
      managers.unshift(current);
    }
    return managers;
  });
  /**
   * A 409 the dialog explains itself: BR-13 with the overbooked days, or a role that can't change
   * because of an RM's team or an employee's allocations.
   */
  protected readonly conflict = signal<{ message: string; days: OverloadedDay[] } | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    if (this.ownAccount) {
      this.form.controls.role.disable();
    }
    this.applyRoleRules(this.form.controls.role.value);
    // The conflict was for the values that were sent; new ones may fit
    this.form.controls.role.valueChanges.pipe(takeUntilDestroyed()).subscribe((role) => {
      this.applyRoleRules(role);
      this.conflict.set(null);
    });
    this.form.controls.capacityPercent.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.conflict.set(null));
  }

  ngOnInit(): void {
    this.users.resourceManagers().subscribe((managers) => this.activeManagers.set(managers));
  }

  protected isEmployee(): boolean {
    return this.role() === 'EMPLOYEE';
  }

  protected formatDay(iso: string): string {
    return shortDate(iso);
  }

  protected nameError(control: AbstractControl, label: string): string {
    if (control.hasError('required') || control.hasError('pattern')) {
      return `${label} is required`;
    }
    if (control.hasError('maxlength')) {
      return `${label} must be at most 100 characters`;
    }
    if (control.hasError('controlChars')) {
      return `${label} must not contain control characters`;
    }
    return control.getError('server') ?? '';
  }

  /** 14 characters from an alphabet without look-alikes (0/O, 1/l/I), shown so it can be copied. */
  protected generatePassword(): void {
    const bytes = crypto.getRandomValues(new Uint32Array(14));
    const password = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join(
      '',
    );
    this.form.controls.temporaryPassword.setValue(password);
    this.form.controls.temporaryPassword.markAsTouched();
    this.showPassword.set(true);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: UpdateUserRequest = {
      email: value.email.trim(),
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      role: value.role,
      departmentId: value.departmentId,
      managerId: value.role === 'EMPLOYEE' ? value.managerId : null,
      seniority: value.seniority,
      capacityPercent: value.capacityPercent,
    };

    this.saving.set(true);
    this.conflict.set(null);
    // Escape or a click outside would close the dialog before the answer arrives, and the page
    // would never learn that the user was saved
    this.dialogRef.disableClose = true;
    const call = this.user
      ? this.users.update(this.user.id, request)
      : this.users.create({ ...request, temporaryPassword: value.temporaryPassword });

    call.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.dialogRef.disableClose = false;
        this.saving.set(false);
        this.showServerErrors(error);
      },
    });
  }

  /** Department and resource manager are required for an employee only, who is the only one with a manager. */
  private applyRoleRules(role: Role): void {
    const { departmentId, managerId } = this.form.controls;
    if (role === 'EMPLOYEE') {
      departmentId.setValidators(Validators.required);
      managerId.setValidators(Validators.required);
    } else {
      departmentId.clearValidators();
      managerId.clearValidators();
      managerId.setValue(null);
    }
    departmentId.updateValueAndValidity();
    managerId.updateValueAndValidity();
  }

  private showServerErrors(error: unknown): void {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    if (!isApiError(body)) {
      this.notifications.error(apiErrorMessage(error));
      return;
    }
    switch (body.code) {
      case 'VALIDATION_ERROR': {
        const unshown = body.details.filter(
          (detail) =>
            !isFieldViolation(detail) || !this.setServerError(detail.field, detail.message),
        );
        this.form.markAllAsTouched();
        if (unshown.length > 0 || body.details.length === 0) {
          this.notifications.error(body.message);
        }
        return;
      }
      case 'EMAIL_TAKEN':
        this.setServerError('email', body.message);
        return;
      // The message is too long for a field error, so the field gets a short one and the box the rest
      case 'CAPACITY_EXCEEDED':
        this.conflict.set({ message: body.message, days: body.details.filter(isOverloadedDay) });
        this.setServerError('capacityPercent', 'Too low for existing allocations');
        return;
      case 'RM_HAS_TEAM':
        this.conflict.set({ message: body.message, days: [] });
        this.setServerError('role', 'Still has active employees');
        return;
      case 'USER_HAS_ACTIVE_ALLOCATIONS':
        this.conflict.set({ message: body.message, days: [] });
        this.setServerError('role', 'Still has allocations');
        return;
      default:
        this.notifications.error(body.message);
    }
  }

  private setServerError(field: string, message: string): boolean {
    const control = this.form.get(field);
    control?.setErrors({ server: message });
    control?.markAsTouched();
    return !!control;
  }
}

function nameValidators(): ValidatorFn[] {
  return [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100), noControlChars];
}
