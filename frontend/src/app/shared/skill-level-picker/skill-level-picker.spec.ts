import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SkillLevelPicker } from './skill-level-picker';

@Component({
  imports: [ReactiveFormsModule, SkillLevelPicker],
  template: `<app-skill-level-picker [formControl]="level" ariaLabel="Level of Java" />`,
})
class Host {
  readonly level = new FormControl<number | null>(3);
}

describe('SkillLevelPicker', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (level: number) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="Level ${level}"]`)!;
    return { fixture, el, button };
  }

  it('shows the five levels and marks the current one', () => {
    const { el, button } = render();

    expect(el.querySelectorAll('mat-button-toggle')).toHaveLength(5);
    expect(button(3).getAttribute('aria-checked')).toBe('true');
    expect(button(4).getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('mat-button-toggle-group')?.getAttribute('aria-label')).toBe(
      'Level of Java',
    );
  });

  it('writes the clicked level to the form control and marks it touched', () => {
    const { fixture, button } = render();

    button(5).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.level.value).toBe(5);
    expect(fixture.componentInstance.level.touched).toBe(true);
    expect(fixture.componentInstance.level.dirty).toBe(true);
  });

  it('follows value changes made from code', () => {
    const { fixture, button } = render();

    fixture.componentInstance.level.setValue(1);
    fixture.detectChanges();

    expect(button(1).getAttribute('aria-checked')).toBe('true');
    expect(button(3).getAttribute('aria-checked')).toBe('false');
  });

  it('can be disabled through the form control', () => {
    const { fixture, button } = render();

    fixture.componentInstance.level.disable();
    fixture.detectChanges();

    expect(button(2).disabled).toBe(true);
  });
});
