import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DateRangePicker, DateRangeValue } from '../../shared/date-range-picker/date-range-picker';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
import { AllocationProposal } from '../allocations/allocation.models';
import { AllocationService } from '../allocations/allocation.service';
import { formatPeriod } from '../projects/project.models';
import { ALLOCATION_OPTIONS, StaffingRequest } from '../requests/request.models';
import { Candidate } from './candidate.models';

/** Pass the request and the candidate to propose for it. Closes with the proposal that was made. */
export interface ProposeDialogData {
  request: StaffingRequest;
  candidate: Candidate;
}

/**
 * The *Propose* dialog on *Candidates*: the percent and the period of the new allocation, filled in
 * from the request. The PM can pick another percent and shorten the period, never beyond the
 * request's (BR-3), e.g. to start after the days the person is busy. API errors (400, 403, 409)
 * are shown by the global error snackbar, and the dialog stays open so the PM can fix the input.
 */
@Component({
  selector: 'app-propose-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    DateRangePicker,
  ],
  template: `
    <h2 mat-dialog-title>Propose {{ candidate.fullName }}</h2>
    <form [formGroup]="form" (ngSubmit)="propose()" novalidate>
      <mat-dialog-content class="propose-dialog__content">
        <p class="propose-dialog__request">{{ request.title }} · score {{ candidate.score }}/100</p>

        @if (candidate.warnings.length) {
          <ul class="propose-dialog__warnings" aria-label="Warnings">
            @for (warning of candidate.warnings; track $index) {
              <li>
                <mat-icon>warning</mat-icon>
                <span>{{ warning }}</span>
              </li>
            }
          </ul>
        }

        <mat-form-field appearance="outline">
          <mat-label>Allocation</mat-label>
          <mat-select formControlName="percent">
            @for (percent of percents; track percent) {
              <mat-option [value]="percent">{{ percent }}%</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <app-date-range-picker
          formControlName="period"
          label="Period"
          required
          [min]="requestStart"
          [max]="requestEnd"
        />
        <p class="propose-dialog__hint">
          The period can be shorter than the request’s ({{ requestPeriod }}), but not longer.
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Propose</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .propose-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
    .propose-dialog__request,
    .propose-dialog__hint {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 12px;
    }
    .propose-dialog__hint {
      font: var(--mat-sys-body-small);
      margin: -4px 0 0;
    }
    .propose-dialog__warnings {
      list-style: none;
      margin: 0 0 16px;
      padding: 6px 12px;
      border-radius: 8px;
      background: light-dark(#ffe9b8, #4d3a00);
      color: light-dark(#5c4300, #ffe08f);

      li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 2px 0;
        font: var(--mat-sys-body-medium);
      }

      mat-icon {
        flex: none;
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }
  `,
})
export class ProposeDialog {
  private readonly allocations = inject(AllocationService);
  private readonly dialogRef =
    inject<MatDialogRef<ProposeDialog, AllocationProposal>>(MatDialogRef);
  private readonly data = inject<ProposeDialogData>(MAT_DIALOG_DATA);

  protected readonly request = this.data.request;
  protected readonly candidate = this.data.candidate;

  protected readonly percents = ALLOCATION_OPTIONS;
  protected readonly requestPeriod = formatPeriod(this.request);
  /** The period of the allocation must stay inside the request's (BR-3). */
  protected readonly requestStart = parseIsoDate(this.request.startDate);
  protected readonly requestEnd = parseIsoDate(this.request.endDate);

  /** Starts with the request's percent and period, which is what the API uses when none is sent. */
  protected readonly form = inject(NonNullableFormBuilder).group({
    percent: this.request.allocationPercent,
    period: { start: this.requestStart, end: this.requestEnd } as DateRangeValue,
  });

  protected readonly saving = signal(false);

  protected propose(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { percent, period } = this.form.getRawValue();

    this.saving.set(true);
    // Escape or a click outside would close the dialog before the answer arrives, and the page
    // would never learn that the proposal was made, or see the warnings that came with it
    this.dialogRef.disableClose = true;
    this.allocations
      .propose({
        requestId: this.request.id,
        employeeId: this.candidate.employeeId,
        percent,
        startDate: toIsoDate(period.start!),
        endDate: toIsoDate(period.end!),
      })
      .subscribe({
        next: (proposal) => this.dialogRef.close(proposal),
        // The global error snackbar has shown the message, so the form only becomes editable again
        error: () => {
          this.dialogRef.disableClose = false;
          this.saving.set(false);
        },
      });
  }
}
