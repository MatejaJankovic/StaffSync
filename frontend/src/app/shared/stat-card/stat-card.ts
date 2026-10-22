import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';

/**
 * A Home page card (§11): a large number, a label and an optional caption. With a `link`, the whole
 * card is a link to the related list.
 *
 * ```html
 * <app-stat-card value="3" label="Decisions waiting for me" link="/approvals" />
 * <app-stat-card value="Project Alpha" label="Next allocation" caption="From 1 Nov 2026" />
 * ```
 */
@Component({
  selector: 'app-stat-card',
  imports: [MatCardModule, NgTemplateOutlet, RouterLink],
  template: `
    <ng-template #content>
      <mat-card appearance="outlined" class="stat-card__card">
        <mat-card-content>
          <div class="stat-card__value">{{ value() }}</div>
          <div class="stat-card__label">{{ label() }}</div>
          @if (caption()) {
            <div class="stat-card__caption">{{ caption() }}</div>
          }
        </mat-card-content>
      </mat-card>
    </ng-template>

    @if (link(); as path) {
      <a class="stat-card__link" [routerLink]="path">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <ng-container [ngTemplateOutlet]="content" />
    }
  `,
  styleUrl: './stat-card.scss',
})
export class StatCard {
  /** Already formatted, e.g. `60%`, `3` or a project name. */
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly caption = input<string | null>(null);
  /** A router path such as `/approvals`. Without one, the card isn't clickable. */
  readonly link = input<string | null>(null);
}
