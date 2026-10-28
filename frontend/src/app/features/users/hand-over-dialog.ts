import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SS_DIALOG_DATA,
  SsButton,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
  SsError,
  SsField,
  SsLabel,
  SsOption,
  SsSelect,
} from '../../shared/ui';
import { fullName, HandOverResult, UserAccount } from './user.models';
import { UserService } from './user.service';

/** Pass the PM whose projects change hands. Closes with how many projects moved. */
export interface HandOverDialogData {
  pm: UserAccount;
}

/**
 * The Admin's *Hand over projects* dialog: every planned or active project of a PM goes to another
 * active PM, who then manages it (BR-4). Needed before a PM with open projects is deactivated or
 * given another role. Completed and cancelled projects keep their PM.
 */
@Component({
  selector: 'app-hand-over-dialog',
  imports: [
    ReactiveFormsModule,
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsError,
    SsField,
    SsLabel,
    SsOption,
    SsSelect,
  ],
  template: `
    <h2 ssDialogTitle>Hand over {{ name }}’s projects</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ss-dialog-content class="hand-over__content">
        <p class="hand-over__intro">
          Every planned or active project of {{ name }} goes to the project manager you pick, with
          its requests and allocations. Completed and cancelled projects stay with {{ name }}.
        </p>
        <ss-field>
          <ss-label>New project manager</ss-label>
          <ss-select formControlName="toPmId">
            @for (pm of pms(); track pm.id) {
              <ss-option [value]="pm.id">{{ fullName(pm) }}</ss-option>
            }
          </ss-select>
          @if (form.controls.toPmId.hasError('required')) {
            <ss-error>Pick a project manager</ss-error>
          }
        </ss-field>
      </ss-dialog-content>

      <ss-dialog-actions class="hand-over__actions">
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Hand over</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    form {
      display: contents;
    }
    .hand-over__content {
      display: flex;
      flex-direction: column;
    }
    .hand-over__intro {
      margin: 0 0 var(--ss-space-4);
      color: var(--ss-ink-muted);
    }
    .hand-over__actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class HandOverDialog implements OnInit {
  private readonly users = inject(UserService);
  private readonly dialogRef = inject<SsDialogRef<HandOverDialog, HandOverResult>>(SsDialogRef);
  private readonly pm = inject<HandOverDialogData>(SS_DIALOG_DATA).pm;

  protected readonly name = fullName(this.pm);
  protected readonly fullName = fullName;
  /** The other active PMs, who can take the projects over. */
  protected readonly pms = signal<UserAccount[]>([]);

  protected readonly form = inject(NonNullableFormBuilder).group({
    toPmId: [null as number | null, Validators.required],
  });

  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.users
      .list({ page: 0, size: 100, sort: 'lastName,asc' }, { role: 'PM', active: true })
      .subscribe((page) => this.pms.set(page.content.filter((pm) => pm.id !== this.pm.id)));
  }

  protected save(): void {
    const toPmId = this.form.getRawValue().toPmId;
    if (this.form.invalid || toPmId === null || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.dialogRef.disableClose = true;
    this.users.handOverProjects(this.pm.id, toPmId).subscribe({
      next: (result) => this.dialogRef.close(result),
      error: () => {
        this.dialogRef.disableClose = false;
        this.saving.set(false);
      },
    });
  }
}
