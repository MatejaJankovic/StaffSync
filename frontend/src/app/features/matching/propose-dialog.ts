import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DateRangePicker, DateRangeValue } from '../../shared/date-range-picker/date-range-picker';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
  SsField,
  SsLabel,
  SsOption,
  SsSelect,
  SsButton,
} from '../../shared/ui';
import { WarningList } from '../../shared/warning-list/warning-list';
import { AllocationProposal } from '../allocations/allocation.models';
import { AllocationService } from '../allocations/allocation.service';
import { formatPeriod } from '../projects/project.models';
import { ALLOCATION_OPTIONS, StaffingRequest } from '../requests/request.models';
import { Candidate, scoreParts } from './candidate.models';

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
    SsButton,
    DateRangePicker,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    SsField,
    SsLabel,
    SsOption,
    SsSelect,
    WarningList,
  ],
  template: `
    <h2 ssDialogTitle>Propose {{ candidate.fullName }}</h2>
    <form [formGroup]="form" (ngSubmit)="propose()" novalidate>
      <ss-dialog-content class="propose-dialog__content">
        <p class="propose-dialog__request">{{ request.title }} · score {{ candidate.score }}/100</p>

        <dl class="propose-dialog__fit ss-num">
          @for (part of parts; track part.label) {
            <div>
              <dt>{{ part.label }}</dt>
              <dd>
                {{ part.value }}<span class="propose-dialog__fit-max">/{{ part.max }}</span>
              </dd>
            </div>
          }
        </dl>

        @if (candidate.warnings.length) {
          <p class="propose-dialog__section">Check before proposing</p>
        }
        <app-warning-list class="propose-dialog__warnings" [warnings]="candidate.warnings" />

        <div class="propose-dialog__fields">
          <ss-field>
            <ss-label>Allocation</ss-label>
            <ss-select formControlName="percent">
              @for (percent of percents; track percent) {
                <ss-option [value]="percent">{{ percent }}%</ss-option>
              }
            </ss-select>
          </ss-field>

          <app-date-range-picker
            formControlName="period"
            label="Period"
            required
            [min]="requestStart"
            [max]="requestEnd"
          />
        </div>
        <p class="propose-dialog__hint">
          The period can be shorter than the request’s ({{ requestPeriod }}), but not longer.
        </p>
      </ss-dialog-content>

      <ss-dialog-actions class="propose-dialog__actions">
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Propose</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    /* The form sits between the dialog container and its content and actions */
    form {
      display: contents;
    }
    .propose-dialog__content {
      display: flex;
      flex-direction: column;
    }
    .propose-dialog__request,
    .propose-dialog__hint {
      color: var(--ss-ink-muted);
      margin: 0 0 var(--ss-space-3);
    }
    .propose-dialog__hint {
      font: var(--ss-type-body-small);
      margin: calc(var(--ss-space-1) * -1) 0 0;
    }
    /* How the score adds up, as three quiet facts between two hairlines */
    .propose-dialog__fit {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--ss-space-3);
      margin: 0 0 var(--ss-space-4);
      padding: var(--ss-space-3) 0;
      border-block: 1px solid var(--ss-line);
    }
    .propose-dialog__fit dt {
      color: var(--ss-ink-muted);
      font: var(--ss-type-label-medium);
      letter-spacing: var(--ss-tracking-label);
    }
    .propose-dialog__fit dd {
      margin: 2px 0 0;
      font-size: var(--ss-text-lg);
      font-weight: 700;
      letter-spacing: var(--ss-tracking-tight);
    }
    .propose-dialog__fit-max {
      color: var(--ss-ink-muted);
      font-size: var(--ss-text-xs);
      font-weight: 500;
      letter-spacing: 0;
    }
    .propose-dialog__section {
      margin: 0 0 var(--ss-space-2);
      color: var(--ss-ink-muted);
      font: var(--ss-type-label-medium);
      letter-spacing: var(--ss-tracking-label);
    }
    .propose-dialog__warnings {
      margin: 0 0 var(--ss-space-4);
    }
    /* Allocation and period side by side, one under the other on a phone */
    .propose-dialog__fields {
      display: grid;
      grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
      gap: 0 var(--ss-space-4);
      align-items: start;
    }
    @media (max-width: 559px) {
      .propose-dialog__fields {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    /* A quiet divider above the right-aligned actions */
    .propose-dialog__actions {
      border-top: 1px solid var(--ss-line);
      padding: var(--ss-space-3) var(--ss-space-6);
    }
  `,
})
export class ProposeDialog {
  private readonly allocations = inject(AllocationService);
  private readonly dialogRef = inject<SsDialogRef<ProposeDialog, AllocationProposal>>(SsDialogRef);
  private readonly data = inject<ProposeDialogData>(SS_DIALOG_DATA);

  protected readonly request = this.data.request;
  protected readonly candidate = this.data.candidate;

  protected readonly percents = ALLOCATION_OPTIONS;
  protected readonly parts = scoreParts(this.candidate);
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
