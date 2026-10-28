import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(inputs: Record<string, string | null>): HTMLElement {
    const fixture = TestBed.createComponent(StatCard);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the value and the label', () => {
    const el = render({ value: '3', label: 'Decisions waiting for me' });

    expect(el.querySelector('.stat-card__value')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('.stat-card__label')?.textContent?.trim()).toBe(
      'Decisions waiting for me',
    );
    expect(el.querySelector('.stat-card__caption')).toBeNull();
  });

  it('shows the caption when there is one', () => {
    const el = render({
      value: 'Project Alpha',
      label: 'Next allocation',
      caption: 'From 1 Nov 2026',
    });

    expect(el.querySelector('.stat-card__caption')?.textContent?.trim()).toBe('From 1 Nov 2026');
  });

  it('links the whole card to the related list', () => {
    const el = render({ value: '3', label: 'Decisions waiting for me', link: '/approvals' });

    const link = el.querySelector('a.stat-card__link');
    expect(link?.getAttribute('href')).toBe('/approvals');
    expect(link?.querySelector('.stat-card__card')).not.toBeNull();
  });

  it('is not a link without one', () => {
    const el = render({ value: '5', label: 'Active projects', link: null });

    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.stat-card__card')).not.toBeNull();
  });
});
