import { Component, inject } from '@angular/core';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogTitle,
  SsButton,
} from '../../shared/ui';
import { Skill } from './skill.models';

/**
 * Asks before a skill is deleted. Closes with `true` when confirmed.
 * Replace with the shared `confirm-dialog` once it lands with US-02 (#10).
 */
@Component({
  selector: 'app-skill-delete-dialog',
  imports: [SsButton, SsDialogActions, SsDialogClose, SsDialogContent, SsDialogTitle],
  template: `
    <header class="skill-delete-dialog__header">
      <h2 ssDialogTitle>Delete skill</h2>
    </header>
    <ss-dialog-content class="skill-delete-dialog__message">
      Delete <strong>{{ skill.name }}</strong> from the catalog? This can't be undone.
    </ss-dialog-content>
    <ss-dialog-actions class="skill-delete-dialog__actions">
      <button ss-button [ssDialogClose]="false">Cancel</button>
      <button
        ss-button="filled"
        class="skill-delete-dialog__confirm ss-button-danger"
        [ssDialogClose]="true"
      >
        Delete
      </button>
    </ss-dialog-actions>
  `,
  styles: `
    .skill-delete-dialog__header {
      border-bottom: 1px solid var(--ss-line);
    }

    .skill-delete-dialog__message {
      padding-top: var(--ss-space-4);
      color: var(--ss-ink);
      line-height: 1.5;
    }

    .skill-delete-dialog__actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class SkillDeleteDialog {
  protected readonly skill = inject<Skill>(SS_DIALOG_DATA);
}
