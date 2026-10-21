import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of } from 'rxjs';
import { Page, PageQuery } from '../../core/api/page';
import { PagedTable, PagedTableColumn } from './paged-table';

interface Row {
  id: number;
  name: string;
}

@Component({
  imports: [PagedTable],
  template: `
    <app-paged-table
      [columns]="columns"
      [fetch]="fetch"
      [clickableRows]="clickable()"
      (rowClick)="clicked.push($event)"
    />
  `,
})
class Host {
  readonly columns: PagedTableColumn<Row>[] = [{ key: 'name', header: 'Name' }];
  readonly clickable = signal(true);
  readonly clicked: Row[] = [];
  readonly fetch = (query: PageQuery) =>
    of<Page<Row>>({
      content: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      page: { size: query.size, number: 0, totalElements: 2, totalPages: 1 },
    });
}

describe('PagedTable row click', () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('emits the row that was clicked', async () => {
    const fixture = await render();

    const rows = fixture.nativeElement.querySelectorAll(
      'tr.mat-mdc-row',
    ) as NodeListOf<HTMLElement>;
    rows[1].click();

    expect(fixture.componentInstance.clicked).toEqual([{ id: 2, name: 'B' }]);
  });

  it('marks rows as clickable only when asked to', async () => {
    const fixture = await render();
    const row = () => fixture.nativeElement.querySelector('tr.mat-mdc-row') as HTMLElement;
    expect(row().classList).toContain('paged-table__row--clickable');

    fixture.componentInstance.clickable.set(false);
    fixture.detectChanges();

    expect(row().classList).not.toContain('paged-table__row--clickable');
  });
});
