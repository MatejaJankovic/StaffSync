import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { keydown } from '../testing';
import { SsToggle, SsToggleGroup } from './toggle-group';

@Component({
  imports: [ReactiveFormsModule, SsToggleGroup, SsToggle],
  template: `
    <ss-toggle-group [formControl]="level" ariaLabel="Level of Java">
      @for (n of levels; track n) {
        <ss-toggle [value]="n" [ariaLabel]="'Level ' + n">{{ n }}</ss-toggle>
      }
    </ss-toggle-group>
  `,
})
class Host {
  readonly levels = [1, 2, 3, 4, 5];
  readonly level = new FormControl<number | null>(3);
}

describe('SsToggleGroup', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (n: number) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="Level ${n}"]`)!;
    return { fixture, el, button, host: fixture.componentInstance };
  }

  it('is a labelled group of buttons that marks the current one as pressed', () => {
    const { el, button } = render();

    expect(el.querySelector('ss-toggle-group')!.getAttribute('role')).toBe('radiogroup');
    expect(el.querySelector('ss-toggle-group')!.getAttribute('aria-label')).toBe('Level of Java');
    expect(el.querySelectorAll('button')).toHaveLength(5);
    expect(button(3).getAttribute('role')).toBe('radio');
    expect(button(3).getAttribute('aria-checked')).toBe('true');
    expect(button(4).getAttribute('aria-checked')).toBe('false');
  });

  it('writes the clicked value to the control and marks it touched and dirty', () => {
    const { fixture, button, host } = render();

    button(5).click();
    fixture.detectChanges();

    expect(host.level.value).toBe(5);
    expect(host.level.touched).toBe(true);
    expect(host.level.dirty).toBe(true);
    expect(button(5).getAttribute('aria-checked')).toBe('true');
    expect(button(3).getAttribute('aria-checked')).toBe('false');
  });

  it('follows the control, including null, and keeps the value when the same one is clicked', () => {
    const { fixture, button, host } = render();

    host.level.setValue(null);
    fixture.detectChanges();
    expect(button(3).getAttribute('aria-checked')).toBe('false');

    host.level.setValue(2);
    fixture.detectChanges();
    button(2).click();
    expect(host.level.value).toBe(2);
  });

  it('is one stop in the tab order: the chosen level, or the first when none is chosen', () => {
    const { fixture, button, host } = render();
    const stops = () => [1, 2, 3, 4, 5].filter((n) => button(n).tabIndex === 0);

    expect(stops()).toEqual([3]);

    host.level.setValue(null);
    fixture.detectChanges();
    expect(stops()).toEqual([1]);
  });

  it('moves to the next or previous level with the arrow keys, wrapping round, and picks it', () => {
    const { fixture, button, host } = render();

    button(3).focus();
    keydown(button(3), 'ArrowRight');
    fixture.detectChanges();
    expect(host.level.value).toBe(4);
    expect(document.activeElement).toBe(button(4));

    keydown(button(4), 'ArrowLeft');
    keydown(button(3), 'ArrowLeft');
    keydown(button(2), 'ArrowLeft');
    fixture.detectChanges();
    expect(host.level.value).toBe(1);

    keydown(button(1), 'ArrowUp');
    fixture.detectChanges();
    expect(host.level.value).toBe(5); // wraps from the first to the last
    expect(button(5).getAttribute('aria-checked')).toBe('true');
    expect(host.level.touched).toBe(true);
  });

  it('cannot be changed while the control is disabled', () => {
    const { fixture, button, host } = render();

    host.level.disable();
    fixture.detectChanges();
    button(1).click();

    expect(button(1).disabled).toBe(true);
    expect(host.level.value).toBe(3);
  });
});
