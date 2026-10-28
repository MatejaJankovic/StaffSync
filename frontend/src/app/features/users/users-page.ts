import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { filter, switchMap } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { Role, ROLE_LABELS } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { SsDialog, SsField, SsLabel, SsOption, SsSelect, SsButton, SsIcon } from '../../shared/ui';
import { Department } from '../departments/department.models';
import { DepartmentService } from '../departments/department.service';
import { SENIORITY_LABELS } from '../profile/profile.models';
import { UserDialog, UserDialogData } from './user-dialog';
import { fullName, ROLES, UserAccount } from './user.models';
import { UserService } from './user.service';

type ActiveFilter = 'active' | 'inactive' | '';

/**
 * Admin page: every account, filtered by department, role and active status, with *Create user*,
 * *Edit* and *Deactivate*. Why a deactivation was refused (BR-12, 409) is shown by the global error
 * snackbar; the dialog shows its own errors.
 */
@Component({
  selector: 'app-users-page',
  imports: [
    SsButton,
    SsIcon,
    SsField,
    SsLabel,
    SsOption,
    SsSelect,
    PagedTable,
    PagedTableCell,
    StatusChip,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage implements OnInit {
  private readonly users = inject(UserService);
  private readonly departmentService = inject(DepartmentService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(SsDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);

  private readonly table = viewChild.required(PagedTable<UserAccount>);

  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly departments = signal<Department[]>([]);

  /** Empty means "all". */
  protected readonly departmentId = signal<number | ''>('');
  protected readonly role = signal<Role | ''>('');
  protected readonly active = signal<ActiveFilter>('active');

  protected readonly columns: PagedTableColumn<UserAccount>[] = [
    { key: 'lastName', header: 'Name', sortable: true, value: fullName },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'role', header: 'Role', sortable: true, value: (u) => ROLE_LABELS[u.role] },
    { key: 'department', header: 'Department', value: (u) => u.department?.name ?? '–' },
    {
      key: 'manager',
      header: 'Resource manager',
      value: (u) => (u.manager ? fullName(u.manager) : '–'),
    },
    {
      key: 'seniority',
      header: 'Seniority',
      sortable: true,
      value: (u) => (u.seniority ? SENIORITY_LABELS[u.seniority] : '–'),
    },
    {
      key: 'capacityPercent',
      numeric: true,
      header: 'Capacity',
      sortable: true,
      value: (u) => `${u.capacityPercent}%`,
    },
    { key: 'active', header: 'Status', sortable: true },
    { key: 'actions', header: '' },
  ];

  /** A new function reloads the table from the first page, so a filter change does that. */
  protected readonly fetch = computed(() => {
    const departmentId = this.departmentId();
    const role = this.role() || undefined;
    const active = this.active();
    return (query: PageQuery) =>
      this.users.list(query, {
        departmentId: departmentId === '' ? undefined : departmentId,
        role,
        active: active === '' ? undefined : active === 'active',
      });
  });

  ngOnInit(): void {
    this.departmentService.list().subscribe((departments) => this.departments.set(departments));
  }

  protected roleLabel(role: Role): string {
    return ROLE_LABELS[role];
  }

  /** Your own account can't be deactivated (409), so the button isn't offered. */
  protected canDeactivate(user: UserAccount): boolean {
    return user.active && user.id !== this.auth.currentUser()?.id;
  }

  protected create(): void {
    this.openDialog({ departments: this.departments }, 'User created');
  }

  protected edit(user: UserAccount): void {
    this.openDialog({ user, departments: this.departments }, 'User saved');
  }

  protected deactivate(user: UserAccount): void {
    this.confirmDialog
      .confirm({
        title: 'Deactivate user?',
        message:
          `${fullName(user)} will no longer be able to log in. ` +
          'A user with current or future allocations can’t be deactivated.',
        confirmText: 'Deactivate',
        destructive: true,
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.users.deactivate(user.id)),
      )
      .subscribe({
        next: () => {
          this.table().reload();
          this.notifications.success(`Deactivated ${fullName(user)}`);
        },
        // The global error snackbar has shown why, e.g. the user still has allocations (BR-12)
        error: () => undefined,
      });
  }

  private openDialog(data: UserDialogData, message: string): void {
    this.dialog
      .open<UserDialog, UserDialogData, UserAccount>(UserDialog, {
        data,
        width: '640px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.table().reload();
          this.notifications.success(message);
        }
      });
  }
}
