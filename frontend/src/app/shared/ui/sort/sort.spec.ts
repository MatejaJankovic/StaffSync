import { CdkTableModule } from '@angular/cdk/table';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { keydown } from '../testing';
import { SsSort, SsSortChange, SsSortHeader } from './sort';

@Component({
  imports: [CdkTableModule, SsSort, SsSortHeader],
  template: `
    <table
      cdk-table
      class="ss-table"
      [dataSource]="rows"
      ssSort
      (ssSortChange)="events.push($event)"
    >
      <ng-container cdkColumnDef="name">
        <th cdk-header-cell *cdkHeaderCellDef ss-sort-header>Name</th>
        <td cdk-cell *cdkCellDef="let row">{{ row.name }}</td>
      </ng-container>
      <ng-container cdkColumnDef="load">
        <th cdk-header-cell *cdkHeaderCellDef ss-sort-header>Load</th>
        <td cdk-cell *cdkCellDef="let row">{{ row.load }}</td>
      </ng-container>
      <ng-container cdkColumnDef="actions">
        <th cdk-header-cell *cdkHeaderCellDef ss-sort-header disabled>Actions</th>
        <td cdk-cell *cdkCellDef="let row">…</td>
      </ng-container>
      <tr cdk-header-row *cdkHeaderRowDef="columns"></tr>
      <tr cdk-row *cdkRowDef="let row; columns: columns"></tr>
    </table>
  `,
})
class Host {
  readonly columns = ['name', 'load', 'actions'];
  readonly rows = [{ name: 'Ana', load: 60 }];
  readonly events: SsSortChange[] = [];
}

describe('SsSort', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const header = (index: number) => el.querySelectorAll<HTMLElement>('th')[index];
    const button = (index: number) => header(index).querySelector<HTMLElement>('.ss-sort__button')!;
    return { fixture, el, header, button, host: fixture.componentInstance };
  }

  it('makes each sortable header a keyboard button, and leaves a disabled one plain', () => {
    const { header, button } = render();

    expect(button(0).getAttribute('role')).toBe('button');
    expect(button(0).tabIndex).toBe(0);
    expect(header(0).getAttribute('aria-sort')).toBeNull();
    expect(button(2).getAttribute('role')).toBeNull();
    expect(button(2).getAttribute('tabindex')).toBeNull();
  });

  it('cycles ascending, descending, then no sort, and says so in aria-sort', () => {
    const { fixture, header, button, host } = render();

    button(0).click();
    fixture.detectChanges();
    expect(header(0).getAttribute('aria-sort')).toBe('ascending');

    button(0).click();
    fixture.detectChanges();
    expect(header(0).getAttribute('aria-sort')).toBe('descending');

    button(0).click();
    fixture.detectChanges();
    expect(header(0).getAttribute('aria-sort')).toBeNull();

    expect(host.events).toEqual([
      { active: 'name', direction: 'asc' },
      { active: 'name', direction: 'desc' },
      { active: 'name', direction: '' },
    ]);
  });

  it('sorts one column at a time: picking another starts it ascending and clears the first', () => {
    const { fixture, header, button, host } = render();

    button(0).click();
    button(1).click();
    fixture.detectChanges();

    expect(header(0).getAttribute('aria-sort')).toBeNull();
    expect(header(1).getAttribute('aria-sort')).toBe('ascending');
    expect(host.events.at(-1)).toEqual({ active: 'load', direction: 'asc' });
  });

  it('sorts from code like Material: a new column starts in `start`, then cycles', () => {
    const { fixture, header, host } = render();
    const sort = fixture.debugElement.query(By.directive(SsSort)).injector.get(SsSort);

    sort.sort({ id: 'name', start: 'desc', disableClear: false });
    fixture.detectChanges();
    expect(header(0).getAttribute('aria-sort')).toBe('descending');
    expect(host.events.at(-1)).toEqual({ active: 'name', direction: 'desc' });

    sort.sort({ id: 'name', start: 'desc', disableClear: false });
    expect(host.events.at(-1)).toEqual({ active: 'name', direction: 'asc' });

    sort.sort({ id: 'name', start: 'desc', disableClear: false });
    expect(host.events.at(-1)).toEqual({ active: 'name', direction: '' });

    sort.sort({ id: 'load' });
    expect(host.events.at(-1)).toEqual({ active: 'load', direction: 'asc' });
  });

  it('never clears the sort when disableClear is set, going back to the start direction', () => {
    const { fixture, host } = render();
    const sort = fixture.debugElement.query(By.directive(SsSort)).injector.get(SsSort);

    sort.sort({ id: 'name', disableClear: true });
    sort.sort({ id: 'name', disableClear: true });
    sort.sort({ id: 'name', disableClear: true });

    expect(host.events.map((e) => e.direction)).toEqual(['asc', 'desc', 'asc']);
  });

  it('works with Enter and Space, and ignores a disabled header', () => {
    const { fixture, header, button, host } = render();

    keydown(button(0), 'Enter');
    fixture.detectChanges();
    expect(header(0).getAttribute('aria-sort')).toBe('ascending');

    const space = keydown(button(1), ' ');
    fixture.detectChanges();
    expect(space.defaultPrevented).toBe(true); // Space must not scroll the page
    expect(header(1).getAttribute('aria-sort')).toBe('ascending');

    button(2).click();
    expect(host.events).toHaveLength(2);
  });
});
