import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
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
import { SsDatepicker } from '../../shared/ui/datepicker/datepicker';
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
    SsButton,
    SsDatepicker,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsError,
    SsField,
    SsInput,
    SsLabel,
  ],
  template: `
    <h2 ssDialogTitle>{{ project ? 'Edit project' : 'New project' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="project-dialog__content">
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

        <ss-field>
          <ss-label>Client</ss-label>
          <input ssInput formControlName="client" />
          @if (
            form.controls.client.hasError('required') || form.controls.client.hasError('pattern')
          ) {
            <ss-error>Client is required</ss-error>
          } @else if (form.controls.client.hasError('maxlength')) {
            <ss-error>Client must be at most {{ maxNameLength }} characters</ss-error>
          } @else if (form.controls.client.hasError('controlChars')) {
            <ss-error>Client must not contain control characters</ss-error>
          }
        </ss-field>

        <ss-field>
          <ss-label>Description</ss-label>
          <textarea ssInput formControlName="description" rows="3"></textarea>
          @if (form.controls.description.hasError('maxlength')) {
            <ss-error>Description must be at most {{ maxDescriptionLength }} characters</ss-error>
          }
        </ss-field>

        <div class="project-dialog__dates">
          <ss-field>
            <ss-label>Start date</ss-label>
            <ss-datepicker formControlName="startDate" />
            @if (form.controls.startDate.hasError('dateParse')) {
              <ss-error>Enter a valid date, like 31/03/2027</ss-error>
            } @else if (form.controls.startDate.hasError('required')) {
              <ss-error>Start date is required</ss-error>
            }
          </ss-field>

          <ss-field>
            <ss-label>End date</ss-label>
            <ss-datepicker formControlName="endDate" />
            @if (form.controls.endDate.hasError('dateParse')) {
              <ss-error>Enter a valid date, like 31/03/2027</ss-error>
            } @else if (form.controls.endDate.hasError('required')) {
              <ss-error>End date is required</ss-error>
            }
          </ss-field>
        </div>
        @if (form.hasError('dateRange') && form.controls.endDate.touched) {
          <p class="project-dialog__error" role="alert">Start date must not be after end date</p>
        }
      </ss-dialog-content>

      <ss-dialog-actions>
        <button ss-button type="button" ssDialogClose>Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Save</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    /* The form sits between the dialog container and its content and actions */
    form {
      display: contents;
    }
    .project-dialog__content {
      display: flex;
      flex-direction: column;
      gap: var(--ss-space-1);
      padding-top: var(--ss-space-4);
    }
    .project-dialog__dates {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0 var(--ss-space-4);
    }
    .project-dialog__error {
      color: var(--ss-danger);
      font-size: var(--ss-text-xs);
      font-weight: 500;
      line-height: 1.4;
      margin: 0 0 var(--ss-space-2);
    }
    ss-dialog-actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class ProjectDialog {
  private readonly projects = inject(ProjectService);
  private readonly dialogRef = inject<SsDialogRef<ProjectDialog, Project>>(SsDialogRef);
  protected readonly project = inject<ProjectDialogData>(SS_DIALOG_DATA).project;

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
