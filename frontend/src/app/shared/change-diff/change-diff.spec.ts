import { TestBed } from '@angular/core/testing';
import { ChangeDiff, ChangeValues } from './change-diff';

// §4 step 8: Marko at 60% on the demo request
const BEFORE: ChangeValues = { percent: 60, startDate: '2026-11-01', endDate: '2027-01-31' };

describe('ChangeDiff', () => {
  function render(after: ChangeValues): HTMLElement {
    const fixture = TestBed.createComponent(ChangeDiff);
    fixture.componentRef.setInput('before', BEFORE);
    fixture.componentRef.setInput('after', after);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function row(el: HTMLElement, label: string): HTMLElement {
    return [...el.querySelectorAll<HTMLElement>('.change-diff__row')].find(
      (node) => node.querySelector('dt')?.textContent?.trim() === label,
    )!;
  }

  /** What is seen: the hidden text for screen readers is left out. */
  function text(node: HTMLElement): string {
    const dd = node.querySelector('dd')!.cloneNode(true) as HTMLElement;
    dd.querySelectorAll('.change-diff__hidden').forEach((hidden) => hidden.remove());
    return dd.textContent!.replace(/\s+/g, ' ').trim();
  }

  it('shows old → new for the percent, as in §4 step 8', () => {
    const el = render({ ...BEFORE, percent: 80 });

    const percent = row(el, 'Allocation');
    expect(text(percent)).toBe('60% → 80%');
    expect(percent.querySelector('.change-diff__old')?.textContent).toBe('60%');
    expect(percent.querySelector('.change-diff__new')?.textContent).toBe('80%');
    expect(percent.classList).toContain('change-diff__row--changed');
  });

  it('shows a period that does not change once, without an arrow', () => {
    const el = render({ ...BEFORE, percent: 80 });

    const period = row(el, 'Period');
    expect(text(period)).toBe('1 Nov 2026 – 31 Jan 2027');
    expect(period.querySelector('.change-diff__arrow')).toBeNull();
    expect(period.classList).not.toContain('change-diff__row--changed');
  });

  it('shows old → new for the period when either date changes', () => {
    const el = render({ ...BEFORE, endDate: '2027-02-28' });

    expect(text(row(el, 'Period'))).toBe('1 Nov 2026 – 31 Jan 2027 → 1 Nov 2026 – 28 Feb 2027');
    expect(text(row(el, 'Allocation'))).toBe('60%');
  });

  it('shows both when both change', () => {
    const el = render({ percent: 40, startDate: '2026-11-15', endDate: '2027-01-31' });

    expect(text(row(el, 'Allocation'))).toBe('60% → 40%');
    expect(text(row(el, 'Period'))).toBe('1 Nov 2026 – 31 Jan 2027 → 15 Nov 2026 – 31 Jan 2027');
  });

  it('reads "changes to" instead of the arrow', () => {
    const el = render({ ...BEFORE, percent: 80 });

    const percent = row(el, 'Allocation').querySelector('dd')!;
    expect(percent.querySelector('.change-diff__arrow')?.getAttribute('aria-hidden')).toBe('true');
    expect(percent.textContent?.replace(/\s+/g, ' ').trim()).toBe('60% → changes to 80%');
  });
});
