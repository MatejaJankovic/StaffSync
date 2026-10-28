import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { ChangeDiff, ChangeValues } from '../../shared/change-diff/change-diff';
import { DateRangePicker, DateRangeValue } from '../../shared/date-range-picker/date-range-picker';
import { parseIsoDate, shortDate, toIsoDate } from '../../shared/dates';
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
import { formatPeriod } from '../projects/project.models';
import { ALLOCATION_OPTIONS, StaffingRequest } from '../requests/request.models';
import { Allocation, AllocationChange, hasStarted } from './allocation.models';
import { AllocationService } from './allocation.service';
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH, textLength } from './allocation.validators';

/** Pass the approved allocation to change, and its request for the period limits (BR-3). */
export interface ChangeRequestDialogData {
  allocation: Allocation;
  request: StaffingRequest;
}

/**
 * The *Request change* dialog on an approved allocation in the team panel (BR-15): the new percent,
 * the new period and a required reason, with a live old → new preview. The current values stay in
 * force until the RM approves the change (BR-16). The period stays inside the request's (BR-3), and
 * once the allocation has started its start date can't change (T-32). API errors (400, 403, 409) are
 * shown by the global error snackbar, and the dialog stays open so the PM can fix the input. Closes
 * with the change and its soft-booking warnings (BR-2).
 */
@Component({
  selector: 'app-change-request-dialog',
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
    ChangeDiff,
    DateRangePicker,
  ],
  template: `
    <h2 ssDialogTitle>Request change for {{ allocation.employeeName }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <ss-dialog-content class="change-request-dialog__content">
        <p class="change-request-dialog__request">
          {{ allocation.requestTitle }} · {{ allocation.projectName }}
        </p>

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
          [min]="earliestStart"
          [max]="requestEnd"
        />
        @if (startMoved()) {
          <p class="change-request-dialog__error" role="alert">
            The allocation started on {{ startedOn }}, so its start date can’t change.
          </p>
        } @else {
          <p class="change-request-dialog__hint">
            @if (started) {
              Started on {{ startedOn }}, so only the end date can change.
            } @else {
              The period must stay inside the request’s ({{ requestPeriod }}).
            }
          </p>
        }

        <ss-field>
          <ss-label>Reason</ss-label>
          <textarea
            ssInput
            formControlName="reason"
            rows="3"
            placeholder="The client asked for more work on the reporting module"
          ></textarea>
          @if (form.controls.reason.hasError('required')) {
            <ss-error>Reason is required</ss-error>
          } @else if (form.controls.reason.hasError('tooShort')) {
            <ss-error>Reason must be at least {{ minReasonLength }} characters</ss-error>
          } @else if (form.controls.reason.hasError('maxlength')) {
            <ss-error>Reason must be at most {{ maxReasonLength }} characters</ss-error>
          }
        </ss-field>

        <section class="change-request-dialog__preview" aria-labelledby="change-preview-title">
          <h3 id="change-preview-title">Preview</h3>
          <app-change-diff [before]="allocation" [after]="after()" />
          @if (!changes()) {
            <p
              class="change-request-dialog__hint"
              [class.change-request-dialog__error]="triedWithoutChange()"
              [attr.role]="triedWithoutChange() ? 'alert' : null"
            >
              Pick a different allocation or period to request a change.
            </p>
          }
        </section>
      </ss-dialog-content>

      <ss-dialog-actions>
        <button ss-button type="button" ssDialogClose [disabled]="saving()">Cancel</button>
        <button ss-button="filled" type="submit" [disabled]="saving()">Request change</button>
      </ss-dialog-actions>
    </form>
  `,
  styles: `
    h2[ssDialogTitle] {
      border-bottom: 1px solid var(--ss-line);
      letter-spacing: var(--ss-tracking-tight);
    }
    form {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }
    .change-request-dialog__content {
      display: flex;
      flex-direction: column;
      padding-top: var(--ss-space-4);
    }
    .change-request-dialog__request {
      margin: 0 0 var(--ss-space-4);
      color: var(--ss-ink-muted);
    }
    .change-request-dialog__hint,
    .change-request-dialog__error {
      margin: calc(-1 * var(--ss-space-1)) 0 var(--ss-space-4);
      font: var(--ss-type-body-small);
      color: var(--ss-ink-muted);
    }
    .change-request-dialog__error {
      font-weight: 500;
      color: var(--ss-danger);
    }
    .change-request-dialog__preview {
      padding: var(--ss-space-3) var(--ss-space-4);
      border-radius: var(--ss-radius-md);
      background: var(--ss-paper);
    }
    .change-request-dialog__preview h3 {
      margin: 0 0 var(--ss-space-2);
      color: var(--ss-ink-muted);
      font: var(--ss-type-label-medium);
      letter-spacing: var(--ss-tracking-label);
    }
    .change-request-dialog__preview .change-request-dialog__hint {
      margin: var(--ss-space-2) 0 0;
    }
    ss-dialog-actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class ChangeRequestDialog {
  private readonly allocations = inject(AllocationService);
  private readonly dialogRef =
    inject<SsDialogRef<ChangeRequestDialog, AllocationChange>>(SsDialogRef);
  private readonly data = inject<ChangeRequestDialogData>(SS_DIALOG_DATA);

  protected readonly allocation = this.data.allocation;

  protected readonly percents = ALLOCATION_OPTIONS;
  protected readonly minReasonLength = MIN_TEXT_LENGTH;
  protected readonly maxReasonLength = MAX_TEXT_LENGTH;
  protected readonly requestPeriod = formatPeriod(this.data.request);
  protected readonly requestEnd = parseIsoDate(this.data.request.endDate);
  /** T-32: once the allocation has started, its start date can't change. */
  protected readonly started = hasStarted(this.allocation);
  protected readonly startedOn = shortDate(this.allocation.startDate);
  /** BR-3, and nothing before the current start once the allocation has started. */
  protected readonly earliestStart = parseIsoDate(
    this.started ? this.allocation.startDate : this.data.request.startDate,
  );

  /** Starts with the current values, so the PM only touches what changes. */
  protected readonly form = inject(NonNullableFormBuilder).group({
    percent: this.allocation.percent,
    period: {
      start: parseIsoDate(this.allocation.startDate),
      end: parseIsoDate(this.allocation.endDate),
    } as DateRangeValue,
    reason: ['', [textLength, Validators.maxLength(MAX_TEXT_LENGTH)]],
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  /** The values the change asks for. A date that isn't entered yet keeps its current value. */
  protected readonly after = computed<ChangeValues>(() => {
    const { percent, period } = this.value();
    return {
      percent,
      startDate: period.start ? toIsoDate(period.start) : this.allocation.startDate,
      endDate: period.end ? toIsoDate(period.end) : this.allocation.endDate,
    };
  });

  /** The API answers 400 when nothing changes. */
  protected readonly changes = computed(() => {
    const after = this.after();
    return (
      after.percent !== this.allocation.percent ||
      after.startDate !== this.allocation.startDate ||
      after.endDate !== this.allocation.endDate
    );
  });

  protected readonly startMoved = computed(
    () => this.started && this.after().startDate !== this.allocation.startDate,
  );

  protected readonly triedWithoutChange = signal(false);
  protected readonly saving = signal(false);

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.triedWithoutChange.set(!this.changes());
    if (this.form.invalid || !this.changes() || this.startMoved()) {
      this.form.markAllAsTouched();
      return;
    }
    const { percent, period, reason } = this.form.getRawValue();

    this.saving.set(true);
    // Escape or a click outside would close the dialog before the answer arrives, and the panel
    // would never learn that the change was requested, or see the warnings that came with it
    this.dialogRef.disableClose = true;
    this.allocations
      .requestChange(this.allocation.id, {
        percent,
        startDate: toIsoDate(period.start!),
        endDate: toIsoDate(period.end!),
        reason: reason.trim(),
      })
      .subscribe({
        next: (change) => this.dialogRef.close(change),
        // The global error snackbar has shown the message, so the form only becomes editable again
        error: () => {
          this.dialogRef.disableClose = false;
          this.saving.set(false);
        },
      });
  }
}
