import { TestBed } from '@angular/core/testing';
import { WarningList } from './warning-list';

describe('WarningList', () => {
  function render(warnings: string[]): HTMLElement {
    const fixture = TestBed.createComponent(WarningList);
    fixture.componentRef.setInput('warnings', warnings);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows every warning in a list named Warnings, each with a warning icon', () => {
    const el = render([
      'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)',
      'Missing PostgreSQL (nice to have)',
    ]);
    const items = el.querySelectorAll('[aria-label="Warnings"] li');
    expect([...items].map((item) => item.querySelector('span')?.textContent)).toEqual([
      'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)',
      'Missing PostgreSQL (nice to have)',
    ]);
    expect([...items].map((item) => item.querySelector('ss-icon')?.textContent)).toEqual([
      'warning',
      'warning',
    ]);
    expect(el.hidden).toBe(false);
  });

  it('is hidden when there are no warnings', () => {
    const el = render([]);
    expect(el.hidden).toBe(true);
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });
});
