import { TestBed } from '@angular/core/testing';
import { CapacityBar, capacityTone } from './capacity-bar';

describe('capacityTone', () => {
  it('is free below 80% of the capacity, nearly full from 80% and full from 100%', () => {
    expect(capacityTone(0, 100)).toBe('free');
    expect(capacityTone(70, 100)).toBe('free');
    expect(capacityTone(80, 100)).toBe('nearly-full');
    expect(capacityTone(90, 100)).toBe('nearly-full');
    expect(capacityTone(100, 100)).toBe('full');
    expect(capacityTone(120, 100)).toBe('full');
  });

  it("measures against the employee's own capacity", () => {
    expect(capacityTone(30, 50)).toBe('free');
    expect(capacityTone(40, 50)).toBe('nearly-full');
    expect(capacityTone(50, 50)).toBe('full');
  });
});

describe('CapacityBar', () => {
  function render(inputs: Record<string, number | string | null>): HTMLElement {
    const fixture = TestBed.createComponent(CapacityBar);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(el: HTMLElement): string | undefined {
    return el.querySelector('.capacity-bar__text')?.textContent?.replace(/\s+/g, ' ').trim();
  }

  it('shows the load against the capacity in text, and the bar is hidden from screen readers', () => {
    const el = render({ load: 60, capacity: 100 });

    expect(text(el)).toBe('60% / 100%');
    expect(el.querySelector('.capacity-bar__label')).toBeNull();
    const bar = el.querySelector('mat-progress-bar');
    expect(bar?.getAttribute('aria-valuenow')).toBe('60');
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
  });

  it("fills the bar by the share of the employee's own capacity", () => {
    const el = render({ load: 40, capacity: 50 });

    expect(text(el)).toBe('40% / 50%');
    expect(el.querySelector('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('80');
    expect(el.classList).toContain('capacity-bar--nearly-full');
  });

  it('caps an overbooked bar at full and shows the label', () => {
    const el = render({ load: 120, capacity: 100, label: 'Over capacity' });

    expect(text(el)).toBe('120% / 100% Over capacity');
    expect(el.querySelector('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('100');
    expect(el.classList).toContain('capacity-bar--full');
  });

  it('is free at 0%', () => {
    const el = render({ load: 0, capacity: 100 });

    expect(el.classList).toContain('capacity-bar--free');
    expect(el.querySelector('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('0');
  });
});
