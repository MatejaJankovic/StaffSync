import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
  SsOption,
  SsSelect,
  SsButton,
} from '../../shared/ui';
import { Skill, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from './skill.models';
import { SkillService } from './skill.service';

/** The API rejects control characters (newlines, tabs, ...) in a name, so it is caught before sending. */
const noControlChars: ValidatorFn = (control) =>
  /\p{Cc}/u.test(String(control.value ?? '')) ? { controlChars: true } : null;

/** Pass the skill to edit, or nothing to add a new one. Closes with the saved skill. */
export interface SkillDialogData {
  skill?: Skill;
}

@Component({
  selector: 'app-skill-dialog',
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
    SsSelect,
    SsOption,
  ],
  template: `
    <header class="skill-dialog__header">
      <h2 ssDialogTitle>{{ skill ? 'Edit skill' : 'Add skill' }}</h2>
    </header>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="skill-dialog__content">
        @if (error(); as message) {
          <p class="skill-dialog__error" role="alert">{{ message }}</p>
        }

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
          <ss-label>Category</ss-label>
          <ss-select formControlName="category">
            @for (category of categories; track category) {
              <ss-option [value]="category">{{ labels[category] }}</ss-option>
            }
          </ss-select>
          @if (form.controls.category.hasError('required')) {
            <ss-error>Category is required</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions class="skill-dialog__actions">
        <button ss-button type="button" ssDialogClose>Cancel</button>
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

    .skill-dialog__header {
      border-bottom: 1px solid var(--ss-line);
    }

    .skill-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: var(--ss-space-4);
    }

    // A failed save (e.g. a duplicate name) reads as a sentence on a danger wash, not as color alone
    .skill-dialog__error {
      margin: 0 0 var(--ss-space-3);
      padding: var(--ss-space-2) var(--ss-space-3);
      border-radius: var(--ss-radius-md);
      font-size: var(--ss-text-sm);
      color: var(--ss-danger);
      background: var(--ss-danger-tint);
    }

    .skill-dialog__actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class SkillDialog {
  private readonly skills = inject(SkillService);
  private readonly dialogRef = inject<SsDialogRef<SkillDialog, Skill>>(SsDialogRef);
  protected readonly skill = inject<SkillDialogData>(SS_DIALOG_DATA).skill;

  protected readonly categories = SKILL_CATEGORIES;
  protected readonly labels = SKILL_CATEGORY_LABELS;
  protected readonly maxNameLength = 100;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [
      this.skill?.name ?? '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(this.maxNameLength),
        noControlChars,
      ],
    ],
    category: [this.skill?.category ?? ('' as Skill['category'] | ''), Validators.required],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, category } = this.form.getRawValue();
    const request = { name: name.trim(), category: category as Skill['category'] };

    this.saving.set(true);
    this.error.set(null);
    const call = this.skill
      ? this.skills.update(this.skill.id, request)
      : this.skills.create(request);

    call.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (err: unknown) => {
        this.saving.set(false);
        // A duplicate name (409) is fixed in the form, so it's shown here and not in a snackbar
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 409
            ? (err.error?.message ?? 'A skill with this name already exists.')
            : 'Unable to save the skill. Please try again.',
        );
      },
    });
  }
}
