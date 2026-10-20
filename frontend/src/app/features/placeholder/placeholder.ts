import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Stand-in for pages that aren't built yet. Shows `data.title` from the route. */
@Component({
  selector: 'app-placeholder',
  template: `
    <section class="placeholder">
      <h1>{{ title() }}</h1>
      <p>This page is coming soon.</p>
    </section>
  `,
  styles: `
    .placeholder {
      padding: 24px;
    }
    h1 {
      font: var(--mat-sys-headline-small);
      margin: 0 0 8px;
    }
    p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
})
export class Placeholder {
  protected readonly title = toSignal(
    inject(ActivatedRoute).data.pipe(map((data) => (data['title'] as string | undefined) ?? '')),
    { initialValue: '' },
  );
}
