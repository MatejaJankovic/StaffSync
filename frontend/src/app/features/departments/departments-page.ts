import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { filter, switchMap } from 'rxjs';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Department } from './department.models';
import { DepartmentService } from './department.service';
import { DepartmentDialog, DepartmentDialogData } from './department-dialog';

const byName = (a: Department, b: Department) => a.name.localeCompare(b.name);

/**
 * Admin page: the departments, with add, rename and delete. API errors (e.g. a duplicate name or
 * a department that still has users, both 409) are shown by the global error snackbar.
 */
@Component({
  selector: 'app-departments-page',
  imports: [MatButtonModule, MatIconModule, MatTableModule],
  templateUrl: './departments-page.html',
  styleUrl: './departments-page.scss',
})
export class DepartmentsPage implements OnInit {
  private readonly departmentService = inject(DepartmentService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);

  protected readonly columns = ['name', 'actions'];
  protected readonly departments = signal<Department[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.departmentService.list().subscribe({
      next: (departments) => {
        this.departments.set([...departments].sort(byName));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  protected add(): void {
    this.openDialog({}, 'Department added');
  }

  protected rename(department: Department): void {
    this.openDialog({ department }, 'Department renamed');
  }

  protected remove(department: Department): void {
    this.confirmDialog
      .confirm({
        title: 'Delete department?',
        message: `${department.name} will be deleted. A department that still has users can't be deleted.`,
        confirmText: 'Delete',
        destructive: true,
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.departmentService.delete(department.id)),
      )
      .subscribe({
        next: () => {
          this.removeFromList(department);
          this.notifications.success(`Deleted ${department.name}`);
        },
        // The global error snackbar has shown why. The department stays in the list, unless it
        // is already gone (404): someone else deleted it, so the stale row would never go away
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.removeFromList(department);
          }
        },
      });
  }

  private removeFromList(department: Department): void {
    this.departments.update((departments) => departments.filter((d) => d.id !== department.id));
  }

  private openDialog(data: DepartmentDialogData, message: string): void {
    this.dialog
      .open<DepartmentDialog, DepartmentDialogData, Department>(DepartmentDialog, {
        data,
        width: '400px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) {
          return;
        }
        this.departments.update((departments) =>
          [...departments.filter((d) => d.id !== saved.id), saved].sort(byName),
        );
        this.notifications.success(message);
      });
  }
}
