import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable, of, throwError } from 'rxjs';
import { Page, PageQuery } from '../../core/api/page';
import { PagedTable, PagedTableColumn } from './paged-table';
import { PagedTableCell } from './paged-table-cell';

interface Row {
  id: number;
  name: string;
  status: string;
}

type Fetch = (query: PageQuery) => Observable<Page<Row>>;

@Component({
  imports: [PagedTable, PagedTableCell],
  template: `
    <app-paged-table [columns]="columns" [fetch]="fetch()">
      <ng-template appPagedTableCell="status" let-row>
        <b class="custom-status">[{{ row.status }}]</b>
      </ng-template>
    </app-paged-table>
  `,
})
class Host {
  readonly columns: PagedTableColumn<Row>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'label', header: 'Label', value: (row) => `#${row.id}` },
    { key: 'status', header: 'Status' },
  ];
  readonly fetch = signal<Fetch>(() => of(emptyPage()));
  readonly table = viewChild.required(PagedTable);
}

function emptyPage(): Page<Row> {
  return { content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } };
}

function pageOf(rows: Row[], totalElements = 45): Page<Row> {
  return { content: rows, page: { size: 20, number: 0, totalElements, totalPages: 3 } };
}

describe('PagedTable', () => {
  let fixture: ComponentFixture<Host>;
  let fetch: ReturnType<typeof vi.fn<Fetch>>;

  async function render(result: () => Observable<Page<Row>>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    fetch = vi.fn<Fetch>(() => result());
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.fetch.set(fetch);
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function lastQuery(): PageQuery {
    return fetch.mock.calls.at(-1)![0];
  }

  function cells(el: HTMLElement): string[] {
    return [...el.querySelectorAll('td.mat-mdc-cell')].map((td) => td.textContent!.trim());
  }

  it('loads the first page with the default size and shows the rows', async () => {
    const el = await render(() => of(pageOf([{ id: 7, name: 'Marko', status: 'APPROVED' }])));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toEqual({ page: 0, size: 20 });
    expect(cells(el)).toEqual(['Marko', '#7', '[APPROVED]']);
    expect(el.querySelector('.custom-status')).toBeTruthy();
    expect(el.querySelector('.mat-mdc-paginator-range-label')?.textContent).toContain('of 45');
  });

  it('requests the next page from the paginator', async () => {
    await render(() => of(pageOf([{ id: 1, name: 'A', status: 'OPEN' }])));

    fixture.debugElement.query(By.directive(MatPaginator)).injector.get(MatPaginator).nextPage();
    await settle();

    expect(lastQuery()).toEqual({ page: 1, size: 20 });
  });

  it('sends the sort and goes back to the first page', async () => {
    await render(() => of(pageOf([{ id: 1, name: 'A', status: 'OPEN' }])));
    fixture.debugElement.query(By.directive(MatPaginator)).injector.get(MatPaginator).nextPage();
    await settle();

    fixture.debugElement
      .query(By.directive(MatSort))
      .injector.get(MatSort)
      .sort({ id: 'name', start: 'desc', disableClear: false });
    await settle();

    expect(lastQuery()).toEqual({ page: 0, size: 20, sort: 'name,desc' });
  });

  it('reloads from the first page when the fetch function changes', async () => {
    await render(() => of(pageOf([{ id: 1, name: 'A', status: 'OPEN' }])));
    fixture.debugElement.query(By.directive(MatPaginator)).injector.get(MatPaginator).nextPage();
    await settle();

    const filtered = vi.fn<Fetch>(() => of(emptyPage()));
    fixture.componentInstance.fetch.set(filtered);
    await settle();

    expect(filtered).toHaveBeenCalledWith({ page: 0, size: 20 });
  });

  it('reload() fetches the current page again', async () => {
    await render(() => of(pageOf([{ id: 1, name: 'A', status: 'OPEN' }])));

    fixture.componentInstance.table().reload();
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(lastQuery()).toEqual({ page: 0, size: 20 });
  });

  it('shows the empty text when there are no rows', async () => {
    const el = await render(() => of(emptyPage()));
    expect(el.querySelector('.paged-table__empty')?.textContent).toContain('No results');
  });

  it('shows no rows when the request fails', async () => {
    const el = await render(() => throwError(() => new Error('500')));
    expect(el.querySelector('.paged-table__empty')?.textContent).toContain('No results');
  });
});
