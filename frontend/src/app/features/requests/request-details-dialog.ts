import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { StatusChip } from '../../shared/status-chip/status-chip';
import {
  SS_DIALOG_DATA,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogTitle,
  SsButton,
} from '../../shared/ui';
import { formatPeriod } from '../projects/project.models';
import { SENIORITY_LABELS, StaffingRequest } from './request.models';

/** Pass the request to show. */
export interface RequestDetailsDialogData {
  request: StaffingRequest;
}

/** A read-only look at one staffing request: its values and the skills it asks for. */
@Component({
  selector: 'app-request-details-dialog',
  imports: [
    DatePipe,
    SsButton,
    SsDialogActions,
    SsDialogClose,
    SsDialogContent,
    SsDialogTitle,
    StatusChip,
  ],
  template: `
    <h2 ssDialogTitle class="request-details__title">
      {{ request.title }}
      <app-status-chip [status]="request.status" />
    </h2>
    <ss-dialog-content>
      <dl class="request-details__info">
        <div>
          <dt>Seniority</dt>
          <dd>{{ seniority }}</dd>
        </div>
        <div>
          <dt>Allocation</dt>
          <dd>{{ request.allocationPercent }}%</dd>
        </div>
        <div>
          <dt>Headcount</dt>
          <dd>{{ request.headcount }}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>{{ period }}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{{ request.createdAt | date: 'd MMM y' }}</dd>
        </div>
      </dl>

      <h3>Required skills</h3>
      @if (required().length === 0) {
        <p class="request-details__none">None</p>
      } @else {
        <ul class="request-details__skills">
          @for (skill of required(); track skill.skillId) {
            <li>
              {{ skill.skillName }} <span>level {{ skill.minLevel }} or more</span>
            </li>
          }
        </ul>
      }

      <h3>Nice to have</h3>
      @if (niceToHave().length === 0) {
        <p class="request-details__none">None</p>
      } @else {
        <ul class="request-details__skills">
          @for (skill of niceToHave(); track skill.skillId) {
            <li>
              {{ skill.skillName }} <span>level {{ skill.minLevel }} or more</span>
            </li>
          }
        </ul>
      }
    </ss-dialog-content>
    <ss-dialog-actions>
      <button ss-button ssDialogClose>Close</button>
    </ss-dialog-actions>
  `,
  styles: `
    .request-details__title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ss-space-2) var(--ss-space-3);
    }
    .request-details__info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: var(--ss-space-4) var(--ss-space-6);
      margin: 0 0 var(--ss-space-2);
      padding-bottom: var(--ss-space-4);
      border-bottom: 1px solid var(--ss-line);
      font-variant-numeric: tabular-nums;

      dt {
        color: var(--ss-ink-muted);
        font: var(--ss-type-label-medium);
        letter-spacing: var(--ss-tracking-label);
      }
      dd {
        margin: var(--ss-space-1) 0 0;
        font: var(--ss-type-body-large);
        font-weight: 500;
      }
    }
    h3 {
      margin: var(--ss-space-4) 0 var(--ss-space-2);
      color: var(--ss-ink-muted);
      font: var(--ss-type-label-large);
      letter-spacing: var(--ss-tracking-label);
    }
    .request-details__skills {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0 var(--ss-space-4);
        padding: var(--ss-space-2) 0;
        border-bottom: 1px solid var(--ss-line);
        font-weight: 500;
      }
      li:last-child {
        border-bottom: 0;
      }
      span {
        color: var(--ss-ink-muted);
        font-size: var(--ss-text-sm);
        font-weight: 400;
        font-variant-numeric: tabular-nums;
      }
    }
    .request-details__none {
      margin: 0;
      color: var(--ss-ink-muted);
    }
    ss-dialog-actions {
      border-top: 1px solid var(--ss-line);
    }
  `,
})
export class RequestDetailsDialog {
  protected readonly request = inject<RequestDetailsDialogData>(SS_DIALOG_DATA).request;
  protected readonly seniority = SENIORITY_LABELS[this.request.seniority];
  protected readonly period = formatPeriod(this.request);

  protected readonly required = computed(() => this.request.skills.filter((s) => s.mandatory));
  protected readonly niceToHave = computed(() => this.request.skills.filter((s) => !s.mandatory));
}
