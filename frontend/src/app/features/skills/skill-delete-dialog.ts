import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Skill } from './skill.models';

/**
 * Asks before a skill is deleted. Closes with `true` when confirmed.
 * Replace with the shared `confirm-dialog` once it lands with US-02 (#10).
 */
@Component({
  selector: 'app-skill-delete-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Delete skill</h2>
    <mat-dialog-content>
      Delete <strong>{{ skill.name }}</strong> from the catalog? This can't be undone.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button [mat-dialog-close]="true">Delete</button>
    </mat-dialog-actions>
  `,
})
export class SkillDeleteDialog {
  protected readonly skill = inject<Skill>(MAT_DIALOG_DATA);
}
