import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SsChip } from './chip';

@Component({
  imports: [SsChip],
  template: `
    <ss-chip class="plain">Java</ss-chip>
    <ss-chip class="removable" removable removeLabel="Remove Go" (removed)="removed.push('Go')"
      >Go</ss-chip
    >
  `,
})
class Host {
  readonly removed: string[] = [];
}

describe('SsChip', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
  }

  it('shows its text, with no button unless it is removable', () => {
    const { el } = render();

    expect(el.querySelector('.plain')!.textContent).toContain('Java');
    expect(el.querySelector('.plain button')).toBeNull();
  });

  it('emits removed from a named remove button', () => {
    const { el, host } = render();
    const button = el.querySelector<HTMLButtonElement>('.removable button')!;

    expect(button.getAttribute('aria-label')).toBe('Remove Go');
    expect(button.type).toBe('button');
    button.click();

    expect(host.removed).toEqual(['Go']);
  });
});
