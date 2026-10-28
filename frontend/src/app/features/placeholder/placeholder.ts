import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Stand-in for pages that aren't built yet. Shows `data.title` from the route. */
@Component({
  selector: 'app-placeholder',
  template: `
    <section class="placeholder ss-page">
      <header class="ss-page-header">
        <h1>{{ title() }}</h1>
      </header>
      <hr class="ss-hairline" />
      <p class="placeholder__note">This page is coming soon.</p>
    </section>
  `,
  styles: `
    h1 {
      font: var(--ss-type-headline-small);
      letter-spacing: var(--ss-tracking-tight);
    }

    .placeholder__note {
      margin: 0;
      color: var(--ss-ink-muted);
    }
  `,
})
export class Placeholder {
  protected readonly title = toSignal(
    inject(ActivatedRoute).data.pipe(map((data) => (data['title'] as string | undefined) ?? '')),
    { initialValue: '' },
  );
}
