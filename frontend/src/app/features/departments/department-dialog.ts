import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Department } from './department.models';
import { DepartmentService } from './department.service';

/** The API rejects control characters (newlines, tabs, ...) in a name, so it is caught before sending. */
const noControlChars: ValidatorFn = (control) =>
  /\p{Cc}/u.test(String(control.value ?? '')) ? { controlChars: true } : null;

/** Pass the department to rename, or nothing to add a new one. Closes with the saved department. */
export interface DepartmentDialogData {
  department?: Department;
}

/**
 * The *Add department* / *Rename department* dialog. API errors, such as a duplicate name (409),
 * are shown by the global error snackbar, and the dialog stays open so the name can be fixed.
 */
@Component({
  selector: 'app-department-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ department ? 'Rename department' : 'Add department' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="department-dialog__content">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
          @if (form.controls.name.hasError('required') || form.controls.name.hasError('pattern')) {
            <mat-error>Name is required</mat-error>
          } @else if (form.controls.name.hasError('maxlength')) {
            <mat-error>Name must be at most {{ maxNameLength }} characters</mat-error>
          } @else if (form.controls.name.hasError('controlChars')) {
            <mat-error>Name must not contain control characters</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .department-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
  `,
})
export class DepartmentDialog {
  private readonly departments = inject(DepartmentService);
  private readonly dialogRef = inject<MatDialogRef<DepartmentDialog, Department>>(MatDialogRef);
  protected readonly department = inject<DepartmentDialogData>(MAT_DIALOG_DATA).department;

  protected readonly maxNameLength = 100;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      this.department?.name ?? '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(this.maxNameLength),
        noControlChars,
      ],
    ],
  });

  protected readonly saving = signal(false);

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const request = { name: this.form.getRawValue().name.trim() };

    this.saving.set(true);
    // Escape or a click outside would close the dialog before the answer arrives, and the page
    // would never learn that the department was saved
    this.dialogRef.disableClose = true;
    const call = this.department
      ? this.departments.update(this.department.id, request)
      : this.departments.create(request);

    call.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      // The global error snackbar has shown the message, so the form only becomes editable again
      error: () => {
        this.dialogRef.disableClose = false;
        this.saving.set(false);
      },
    });
  }
}
