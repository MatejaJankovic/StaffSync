import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SsProgressBar, SsSpinner } from './progress';

@Component({
  imports: [SsProgressBar, SsSpinner],
  template: `
    <ss-progress-bar class="bar" [value]="value()" aria-label="Capacity used" />
    <ss-progress-bar class="loading" mode="indeterminate" aria-label="Loading" />
    <ss-spinner aria-label="Signing in" [diameter]="20" />
  `,
})
class Host {
  readonly value = signal(60);
}

describe('SsProgressBar and SsSpinner', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      el,
      bar: el.querySelector<HTMLElement>('.bar')!,
      host: fixture.componentInstance,
    };
  }

  it('is a progressbar that reports its value, kept between 0 and 100', () => {
    const { fixture, bar, host } = render();

    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.style.getPropertyValue('--ss-progress-value')).toBe('60%');

    host.value.set(250);
    fixture.detectChanges();
    expect(bar.getAttribute('aria-valuenow')).toBe('100');

    host.value.set(-5);
    fixture.detectChanges();
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });

  it('has no value while it is indeterminate', () => {
    const { el } = render();
    const loading = el.querySelector('.loading')!;

    expect(loading.classList).toContain('ss-progress--indeterminate');
    expect(loading.getAttribute('aria-valuenow')).toBeNull();
    expect(loading.getAttribute('aria-label')).toBe('Loading');
  });

  it('draws a spinner of the given size', () => {
    const { el } = render();
    const spinner = el.querySelector<HTMLElement>('ss-spinner')!;

    expect(spinner.getAttribute('role')).toBe('progressbar');
    expect(spinner.style.width).toBe('20px');
    expect(spinner.querySelector('svg circle')).not.toBeNull();
  });
});
