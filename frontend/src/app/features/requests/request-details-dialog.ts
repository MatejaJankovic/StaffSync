import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { formatPeriod } from '../projects/project.models';
import { SENIORITY_LABELS, StaffingRequest } from './request.models';

/** Pass the request to show. */
export interface RequestDetailsDialogData {
  request: StaffingRequest;
}

/** A read-only look at one staffing request: its values and the skills it asks for. */
@Component({
  selector: 'app-request-details-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, StatusChip],
  template: `
    <h2 mat-dialog-title class="request-details__title">
      {{ request.title }}
      <app-status-chip [status]="request.status" />
    </h2>
    <mat-dialog-content>
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
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .request-details__title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .request-details__info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px 24px;
      margin: 0 0 16px;

      dt {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      dd {
        margin: 2px 0 0;
        font: var(--mat-sys-body-large);
      }
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 16px 0 4px;
    }
    .request-details__skills {
      margin: 0;
      padding-left: 20px;

      span {
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .request-details__none {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
})
export class RequestDetailsDialog {
  protected readonly request = inject<RequestDetailsDialogData>(MAT_DIALOG_DATA).request;
  protected readonly seniority = SENIORITY_LABELS[this.request.seniority];
  protected readonly period = formatPeriod(this.request);

  protected readonly required = computed(() => this.request.skills.filter((s) => s.mandatory));
  protected readonly niceToHave = computed(() => this.request.skills.filter((s) => !s.mandatory));
}
