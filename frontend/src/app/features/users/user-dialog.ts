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
import { apiErrorMessage, isApiError } from '../../core/api/api-error';
import { Role, ROLE_LABELS } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { shortDate } from '../../shared/dates';
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
  SsOption,
  SsSelect,
  SsSuffix,
  SsButton,
  SsIcon,
} from '../../shared/ui';
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
    SsOption,
    SsSelect,
    SsSuffix,
  ],
  template: `
    <header class="user-dialog__header">
      <h2 ssDialogTitle>{{ user ? 'Edit user' : 'Create user' }}</h2>
      <p class="user-dialog__subtitle">
        {{
          user
            ? fullName(user) + ' · ' + user.email
            : 'Add an account, then share the temporary password with the person.'
        }}
      </p>
    </header>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="user-dialog__content">
        <section class="user-dialog__section" aria-labelledby="user-dialog-identity">
          <h3 class="user-dialog__section-title" id="user-dialog-identity">Identity</h3>
          <div class="user-dialog__grid">
            <ss-field class="user-dialog__wide">
              <ss-label>Email</ss-label>
              <input ssInput formControlName="email" type="email" autocomplete="off" />
              @if (form.controls.email.hasError('required')) {
                <ss-error>Email is required</ss-error>
              } @else if (form.controls.email.hasError('email')) {
                <ss-error>Email must be a valid email address</ss-error>
              } @else if (form.controls.email.hasError('maxlength')) {
                <ss-error>Email must be at most 255 characters</ss-error>
              } @else if (form.controls.email.hasError('server')) {
                <ss-error>{{ form.controls.email.getError('server') }}</ss-error>
              }
            </ss-field>
            <ss-field>
              <ss-label>First name</ss-label>
              <input ssInput formControlName="firstName" />
              <ss-error>{{ nameError(form.controls.firstName, 'First name') }}</ss-error>
            </ss-field>
            <ss-field>
              <ss-label>Last name</ss-label>
              <input ssInput formControlName="lastName" />
              <ss-error>{{ nameError(form.controls.lastName, 'Last name') }}</ss-error>
            </ss-field>
          </div>
        </section>

        <section class="user-dialog__section" aria-labelledby="user-dialog-team">
          <h3 class="user-dialog__section-title" id="user-dialog-team">Role and team</h3>
          <div class="user-dialog__grid">
            <ss-field>
              <ss-label>Role</ss-label>
              <ss-select formControlName="role">
                @for (role of roles; track role) {
                  <ss-option [value]="role">{{ roleLabels[role] }}</ss-option>
                }
              </ss-select>
              @if (ownAccount) {
                <ss-hint>You can’t change your own role</ss-hint>
              }
              @if (form.controls.role.hasError('server')) {
                <ss-error>{{ form.controls.role.getError('server') }}</ss-error>
              }
            </ss-field>
            <ss-field>
              <ss-label>Department</ss-label>
              <ss-select formControlName="departmentId">
                @if (isAdmin()) {
                  <ss-option [value]="null">None</ss-option>
                }
                @for (department of departments(); track department.id) {
                  <ss-option [value]="department.id">{{ department.name }}</ss-option>
                }
              </ss-select>
              @if (form.controls.departmentId.hasError('required')) {
                <ss-error>An employee, a PM and an RM need a department</ss-error>
              } @else if (form.controls.departmentId.hasError('server')) {
                <ss-error>{{ form.controls.departmentId.getError('server') }}</ss-error>
              }
            </ss-field>
            @if (isEmployee()) {
              <ss-field class="user-dialog__wide">
                <ss-label>Resource manager</ss-label>
                <ss-select formControlName="managerId">
                  @for (rm of managers(); track rm.id) {
                    <ss-option [value]="rm.id">{{ fullName(rm) }}</ss-option>
                  }
                </ss-select>
                @if (form.controls.managerId.hasError('required')) {
                  <ss-error>An employee needs a resource manager</ss-error>
                } @else if (form.controls.managerId.hasError('server')) {
                  <ss-error>{{ form.controls.managerId.getError('server') }}</ss-error>
                }
              </ss-field>
            }
          </div>
        </section>

        <!-- Only an employee is matched and allocated, so only they have a seniority and a capacity -->
        @if (isEmployee()) {
          <section class="user-dialog__section" aria-labelledby="user-dialog-capacity">
            <h3 class="user-dialog__section-title" id="user-dialog-capacity">
              Seniority and capacity
            </h3>
            <div class="user-dialog__grid">
              <ss-field>
                <ss-label>Seniority</ss-label>
                <ss-select formControlName="seniority">
                  @for (seniority of seniorities; track seniority) {
                    <ss-option [value]="seniority">{{ seniorityLabels[seniority] }}</ss-option>
                  }
                </ss-select>
                @if (form.controls.seniority.hasError('required')) {
                  <ss-error>An employee needs a seniority</ss-error>
                } @else if (form.controls.seniority.hasError('server')) {
                  <ss-error>{{ form.controls.seniority.getError('server') }}</ss-error>
                }
              </ss-field>
              <ss-field>
                <ss-label>Capacity</ss-label>
                <ss-select formControlName="capacityPercent">
                  @for (capacity of capacities; track capacity) {
                    <ss-option [value]="capacity">{{ capacity }}%</ss-option>
                  }
                </ss-select>
                @if (form.controls.capacityPercent.hasError('server')) {
                  <ss-error>{{ form.controls.capacityPercent.getError('server') }}</ss-error>
                }
              </ss-field>
            </div>
          </section>
        }

        @if (conflict(); as conflict) {
          <div class="user-dialog__conflict" role="alert">
            <ss-icon aria-hidden="true">error_outline</ss-icon>
            <div>
              <p>{{ conflict.message }}</p>
              @if (conflict.days.length > 0) {
                <ul>
                  @for (day of conflict.days.slice(0, maxDaysShown); track day.date) {
                    <li class="ss-num">{{ formatDay(day.date) }}: {{ day.load }}% allocated</li>
                  }
                </ul>
                @if (conflict.days.length > maxDaysShown) {
                  @let more = conflict.days.length - maxDaysShown;
                  <p>and {{ more }} more {{ more === 1 ? 'day' : 'days' }}.</p>
                }
              }
            </div>
          </div>
        }

        @if (!user) {
          <section class="user-dialog__section" aria-labelledby="user-dialog-signin">
            <h3 class="user-dialog__section-title" id="user-dialog-signin">Sign-in</h3>
            <ss-field>
              <ss-label>Temporary password</ss-label>
              <input
                ssInput
                formControlName="temporaryPassword"
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="new-password"
              />
              <button
                ss-button="icon"
                ssSuffix
                type="button"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                (click)="showPassword.set(!showPassword())"
              >
                <ss-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</ss-icon>
              </button>
              <ss-hint>Share it with the user. They change it after logging in.</ss-hint>
              @if (form.controls.temporaryPassword.hasError('required')) {
                <ss-error>Temporary password is required</ss-error>
              } @else if (
                form.controls.temporaryPassword.hasError('minlength') ||
                form.controls.temporaryPassword.hasError('maxlength')
              ) {
                <ss-error>Temporary password must be 8 to 72 characters</ss-error>
              } @else if (form.controls.temporaryPassword.hasError('maxBytes')) {
                <ss-error>
                  Temporary password must be at most 72 bytes (an accented letter counts as 2)
                </ss-error>
              } @else if (form.controls.temporaryPassword.hasError('server')) {
                <ss-error>{{ form.controls.temporaryPassword.getError('server') }}</ss-error>
              }
            </ss-field>
            <button
              ss-button
              type="button"
              class="user-dialog__generate"
              (click)="generatePassword()"
            >
              <ss-icon>password</ss-icon>
              Generate password
            </button>
          </section>
        }
      </ss-dialog-content>

      <ss-dialog-actions class="user-dialog__actions">
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">
          {{ user ? 'Save' : 'Create' }}
        </button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    form {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    // Title block and actions are set off from the form by a quiet hairline
    .user-dialog__header {
      border-bottom: 1px solid var(--ss-line);
      padding-bottom: var(--ss-space-3);
    }

    .user-dialog__subtitle {
      margin: calc(-1 * var(--ss-space-1)) var(--ss-space-6) 0;
      font-size: var(--ss-text-sm);
      color: var(--ss-ink-muted);
      overflow-wrap: anywhere;
    }

    .user-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: 0;
    }

    .user-dialog__section {
      padding: var(--ss-space-4) 0 var(--ss-space-1);

      & + & {
        border-top: 1px solid var(--ss-line);
      }
    }

    .user-dialog__section-title {
      margin: 0 0 var(--ss-space-3);
      font: var(--ss-type-label-medium);
      font-weight: 600;
      letter-spacing: var(--ss-tracking-label);
      color: var(--ss-ink-muted);
    }

    .user-dialog__section ss-field {
      width: 100%;
    }

    // Two columns on wide, one on a phone; the email and the manager take the full row
    .user-dialog__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--ss-space-3);

      ss-field {
        min-width: 0;
      }
    }

    .user-dialog__wide {
      grid-column: 1 / -1;
    }

    // The show/hide button keeps a 40px target without making the box taller
    .user-dialog__section [ssSuffix] {
      margin-inline-end: calc(-1 * var(--ss-space-2));
    }

    .user-dialog__generate {
      margin: 0 0 var(--ss-space-3);
    }

    .user-dialog__conflict {
      display: flex;
      gap: var(--ss-space-2);
      margin-bottom: var(--ss-space-3);
      padding: var(--ss-space-3);
      border-radius: var(--ss-radius-md);
      color: var(--ss-danger);
      background: var(--ss-danger-tint);

      p,
      ul {
        margin: var(--ss-space-1) 0;
      }

      ul {
        padding-inline-start: var(--ss-space-4);
      }
    }

    .user-dialog__actions {
      border-top: 1px solid var(--ss-line);
    }

    @media (max-width: 599px) {
      .user-dialog__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class UserDialog implements OnInit {
  private readonly users = inject(UserService);
  private readonly notifications = inject(Notifications);
  private readonly dialogRef = inject<SsDialogRef<UserDialog, UserAccount>>(SsDialogRef);
  private readonly data = inject<UserDialogData>(SS_DIALOG_DATA);

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

  protected isAdmin(): boolean {
    return this.role() === 'ADMIN';
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

  /**
   * Everybody but the Admin belongs to a department. Only an employee has a resource manager, a
   * seniority and a part-time capacity, since only they are matched and allocated; anybody else
   * gets no seniority and 100%, as the API expects.
   */
  private applyRoleRules(role: Role): void {
    const { departmentId, managerId, seniority, capacityPercent } = this.form.controls;
    if (role === 'ADMIN') {
      departmentId.clearValidators();
    } else {
      departmentId.setValidators(Validators.required);
    }
    if (role === 'EMPLOYEE') {
      managerId.setValidators(Validators.required);
      seniority.setValidators(Validators.required);
    } else {
      managerId.clearValidators();
      managerId.setValue(null);
      seniority.clearValidators();
      seniority.setValue(null);
      capacityPercent.setValue(100);
    }
    departmentId.updateValueAndValidity();
    managerId.updateValueAndValidity();
    seniority.updateValueAndValidity();
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
      case 'PM_HAS_OPEN_PROJECTS':
        this.conflict.set({ message: body.message, days: [] });
        this.setServerError('role', 'Still manages open projects');
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
