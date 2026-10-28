import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
  SsError,
  SsField,
  SsInput,
  SsLabel,
  SsButton,
} from '../../shared/ui';
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
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsField,
    SsLabel,
    SsError,
    SsInput,
  ],
  template: `
    <header class="department-dialog__header">
      <h2 ssDialogTitle>{{ department ? 'Rename department' : 'Add department' }}</h2>
    </header>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="department-dialog__content">
        <ss-field>
          <ss-label>Name</ss-label>
          <input ssInput formControlName="name" />
          @if (form.controls.name.hasError('required') || form.controls.name.hasError('pattern')) {
            <ss-error>Name is required</ss-error>
          } @else if (form.controls.name.hasError('maxlength')) {
            <ss-error>Name must be at most {{ maxNameLength }} characters</ss-error>
          } @else if (form.controls.name.hasError('controlChars')) {
            <ss-error>Name must not contain control characters</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions class="department-dialog__actions">
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Save</button>
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

    .department-dialog__header {
      border-bottom: 1px solid var(--ss-line);
    }

    .department-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: var(--ss-space-4);
    }

    .department-dialog__actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class DepartmentDialog {
  private readonly departments = inject(DepartmentService);
  private readonly dialogRef = inject<SsDialogRef<DepartmentDialog, Department>>(SsDialogRef);
  protected readonly department = inject<DepartmentDialogData>(SS_DIALOG_DATA).department;

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
