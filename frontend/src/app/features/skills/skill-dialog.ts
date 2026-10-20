import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Skill, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from './skill.models';
import { SkillService } from './skill.service';

/** Pass the skill to edit, or nothing to add a new one. Closes with the saved skill. */
export interface SkillDialogData {
  skill?: Skill;
}

@Component({
  selector: 'app-skill-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ skill ? 'Edit skill' : 'Add skill' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="skill-dialog__content">
        @if (error(); as message) {
          <p class="skill-dialog__error" role="alert">{{ message }}</p>
        }

        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" maxlength="100" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select formControlName="category">
            @for (category of categories; track category) {
              <mat-option [value]="category">{{ labels[category] }}</mat-option>
            }
          </mat-select>
          @if (form.controls.category.hasError('required')) {
            <mat-error>Category is required</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .skill-dialog__content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }
    .skill-dialog__error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
    }
  `,
})
export class SkillDialog {
  private readonly skills = inject(SkillService);
  private readonly dialogRef = inject<MatDialogRef<SkillDialog, Skill>>(MatDialogRef);
  protected readonly skill = inject<SkillDialogData>(MAT_DIALOG_DATA).skill;

  protected readonly categories = SKILL_CATEGORIES;
  protected readonly labels = SKILL_CATEGORY_LABELS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.skill?.name ?? '', [Validators.required, Validators.pattern(/\S/)]],
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
