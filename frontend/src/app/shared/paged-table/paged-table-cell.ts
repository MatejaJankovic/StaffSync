import { Directive, inject, input, TemplateRef } from '@angular/core';

/**
 * A custom cell for one column of `<app-paged-table>`; `let-row` is the row.
 *
 * ```html
 * <ng-template appPagedTableCell="status" let-row>
 *   <app-status-chip [status]="row.status" />
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[appPagedTableCell]' })
export class PagedTableCell {
  /** The `key` of the column this template renders. */
  readonly column = input.required<string>({ alias: 'appPagedTableCell' });

  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
}
