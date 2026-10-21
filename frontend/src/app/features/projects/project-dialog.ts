import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { parseIsoDate, provideDayFirstDates, toIsoDate } from '../../shared/dates';
import { Project } from './project.models';
import { ProjectService } from './project.service';

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

/** The API rejects control characters (newlines, tabs, ...) in a name, so it is caught before sending. */
const noControlChars: ValidatorFn = (control) =>
  /\p{Cc}/u.test(String(control.value ?? '')) ? { controlChars: true } : null;

/** BR-3: the start date can't be after the end date. */
const startNotAfterEnd: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const start = group.get('startDate')?.value as Date | null;
  const end = group.get('endDate')?.value as Date | null;
  return start && end && start.getTime() > end.getTime() ? { dateRange: true } : null;
};

/** Pass the project to edit, or nothing to create a new one. Closes with the saved project. */
export interface ProjectDialogData {
  project?: Project;
}

/** The *New project* / *Edit project* dialog: a reactive form that creates or updates a project. */
@Component({
  selector: 'app-project-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [provideDayFirstDates()],
  template: `
    <h2 mat-dialog-title>{{ project ? 'Edit project' : 'New project' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="project-dialog__content">
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

        <mat-form-field appearance="outline">
          <mat-label>Client</mat-label>
          <input matInput formControlName="client" />
          @if (
            form.controls.client.hasError('required') || form.controls.client.hasError('pattern')
          ) {
            <mat-error>Client is required</mat-error>
          } @else if (form.controls.client.hasError('maxlength')) {
            <mat-error>Client must be at most {{ maxNameLength }} characters</mat-error>
          } @else if (form.controls.client.hasError('controlChars')) {
            <mat-error>Client must not contain control characters</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput formControlName="description" rows="3"></textarea>
          @if (form.controls.description.hasError('maxlength')) {
            <mat-error>Description must be at most {{ maxDescriptionLength }} characters</mat-error>
          }
        </mat-form-field>

        <div class="project-dialog__dates">
          <mat-form-field appearance="outline">
            <mat-label>Start date</mat-label>
            <input matInput [matDatepicker]="startPicker" formControlName="startDate" />
            <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
            <mat-datepicker #startPicker />
            @if (form.controls.startDate.hasError('matDatepickerParse')) {
              <mat-error>Enter a valid date, like 31/03/2027</mat-error>
            } @else if (form.controls.startDate.hasError('required')) {
              <mat-error>Start date is required</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>End date</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="endDate" />
            <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
            <mat-datepicker #endPicker />
            @if (form.controls.endDate.hasError('matDatepickerParse')) {
              <mat-error>Enter a valid date, like 31/03/2027</mat-error>
            } @else if (form.controls.endDate.hasError('required')) {
              <mat-error>End date is required</mat-error>
            }
          </mat-form-field>
        </div>
        @if (form.hasError('dateRange') && form.controls.endDate.touched) {
          <p class="project-dialog__error" role="alert">Start date must not be after end date</p>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .project-dialog__content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }
    .project-dialog__dates {
      display: flex;
      flex-wrap: wrap;
      gap: 0 16px;

      mat-form-field {
        flex: 1 1 180px;
      }
    }
    .project-dialog__error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0 0 8px;
    }
  `,
})
export class ProjectDialog {
  private readonly projects = inject(ProjectService);
  private readonly dialogRef = inject<MatDialogRef<ProjectDialog, Project>>(MatDialogRef);
  protected readonly project = inject<ProjectDialogData>(MAT_DIALOG_DATA).project;

  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxDescriptionLength = MAX_DESCRIPTION_LENGTH;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      name: [
        this.project?.name ?? '',
        [
          Validators.required,
          Validators.pattern(/\S/),
          Validators.maxLength(MAX_NAME_LENGTH),
          noControlChars,
        ],
      ],
      client: [
        this.project?.client ?? '',
        [
          Validators.required,
          Validators.pattern(/\S/),
          Validators.maxLength(MAX_NAME_LENGTH),
          noControlChars,
        ],
      ],
      description: [
        this.project?.description ?? '',
        [Validators.maxLength(MAX_DESCRIPTION_LENGTH)],
      ],
      startDate: [
        this.project ? parseIsoDate(this.project.startDate) : (null as Date | null),
        Validators.required,
      ],
      endDate: [
        this.project ? parseIsoDate(this.project.endDate) : (null as Date | null),
        Validators.required,
      ],
    },
    { validators: startNotAfterEnd },
  );

  protected readonly saving = signal(false);

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      name: value.name.trim(),
      client: value.client.trim(),
      description: value.description.trim() || null,
      startDate: toIsoDate(value.startDate!),
      endDate: toIsoDate(value.endDate!),
    };

    this.saving.set(true);
    const call = this.project
      ? this.projects.update(this.project.id, request)
      : this.projects.create(request);

    call.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      // The error snackbar already shows the API's message (e.g. a project that has been closed)
      error: () => this.saving.set(false),
    });
  }
}
