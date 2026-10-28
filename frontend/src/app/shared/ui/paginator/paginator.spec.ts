import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SsPageEvent, SsPaginator } from './paginator';

@Component({
  imports: [SsPaginator],
  template: `
    <ss-paginator
      [length]="length()"
      [pageIndex]="pageIndex()"
      [pageSize]="pageSize()"
      [pageSizeOptions]="[10, 20, 50]"
      showFirstLastButtons
      (page)="pages.push($event)"
    />
  `,
})
class Host {
  readonly length = signal(134);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pages: SsPageEvent[] = [];
}

describe('SsPaginator', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (name: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    const range = () => el.querySelector('.ss-paginator__range')!.textContent!.trim();
    const update = () => fixture.detectChanges();
    return { fixture, el, button, range, update, host: fixture.componentInstance };
  }

  it('shows the range of rows on the page and the total', () => {
    const { range, host, update } = render();

    expect(range()).toBe('1 – 20 of 134');

    host.pageIndex.set(6); // the last page holds 14 rows
    update();
    expect(range()).toBe('121 – 134 of 134');

    host.length.set(0);
    update();
    expect(range()).toBe('0 of 0');
  });

  it('disables the buttons that go nowhere', () => {
    const { button, host, update } = render();

    expect(button('First page').disabled).toBe(true);
    expect(button('Previous page').disabled).toBe(true);
    expect(button('Next page').disabled).toBe(false);

    host.pageIndex.set(6);
    update();
    expect(button('Next page').disabled).toBe(true);
    expect(button('Last page').disabled).toBe(true);
    expect(button('First page').disabled).toBe(false);
  });

  it('emits the new page, with the old one, for next, previous, first and last', () => {
    const { button, host, update } = render();

    button('Next page').click();
    expect(host.pages.at(-1)).toEqual({
      pageIndex: 1,
      previousPageIndex: 0,
      pageSize: 20,
      length: 134,
    });

    host.pageIndex.set(3);
    update();
    button('Previous page').click();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 2, previousPageIndex: 3 });
    button('First page').click();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 0, previousPageIndex: 3 });
    button('Last page').click();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 6, previousPageIndex: 3 });
  });

  it('moves from code like Material: nextPage, previousPage, firstPage, lastPage, and stays at the ends', () => {
    const { fixture, host, update } = render();
    const paginator = fixture.debugElement.query(By.directive(SsPaginator))
      .componentInstance as SsPaginator;

    paginator.previousPage();
    paginator.firstPage();
    expect(host.pages).toHaveLength(0); // already on the first page

    paginator.nextPage();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 1, previousPageIndex: 0 });

    host.pageIndex.set(6);
    update();
    paginator.nextPage();
    paginator.lastPage();
    expect(host.pages).toHaveLength(1); // already on the last page

    paginator.previousPage();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 5, previousPageIndex: 6 });
    paginator.firstPage();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 0, previousPageIndex: 6 });

    host.pageIndex.set(0);
    update();
    paginator.lastPage();
    expect(host.pages.at(-1)).toMatchObject({ pageIndex: 6, previousPageIndex: 0 });
  });

  it('offers the page sizes, and keeps the first row in view when the size changes', async () => {
    const { fixture, el, host, update } = render();
    host.pageIndex.set(3); // first row on screen: 61
    update();

    const trigger = el.querySelector<HTMLElement>('[role="combobox"]')!;
    expect(trigger.getAttribute('aria-label')).toBe('Items per page:');
    expect(trigger.textContent).toContain('20');

    trigger.click();
    update();
    await fixture.whenStable();
    update();
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((o) => o.querySelector('.ss-option__text')!.textContent!.trim())).toEqual([
      '10',
      '20',
      '50',
    ]);

    options[2].click(); // 50 per page: row 61 is on page 1 (rows 51-100)
    update();
    expect(host.pages.at(-1)).toEqual({
      pageIndex: 1,
      previousPageIndex: 3,
      pageSize: 50,
      length: 134,
    });
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });
});
