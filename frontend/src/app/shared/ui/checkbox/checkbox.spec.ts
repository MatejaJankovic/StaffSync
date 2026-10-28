import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SsCheckbox } from './checkbox';

@Component({
  imports: [ReactiveFormsModule, SsCheckbox],
  template: `<ss-checkbox [formControl]="remote">Remote work</ss-checkbox>`,
})
class Host {
  readonly remote = new FormControl(false, { nonNullable: true });
}

describe('SsCheckbox', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      el,
      input: el.querySelector<HTMLInputElement>('input')!,
      host: fixture.componentInstance,
    };
  }

  it('is a native checkbox named by its text', () => {
    const { el, input } = render();

    expect(input.type).toBe('checkbox');
    expect(el.querySelector('label')!.textContent).toContain('Remote work');
    expect(input.checked).toBe(false);
  });

  it('reflects the control, and writes back what the user does, marking it touched', () => {
    const { fixture, input, host } = render();

    host.remote.setValue(true);
    fixture.detectChanges();
    expect(input.checked).toBe(true);

    input.click();
    fixture.detectChanges();
    expect(host.remote.value).toBe(false);
    expect(host.remote.dirty).toBe(true);

    input.dispatchEvent(new Event('blur'));
    expect(host.remote.touched).toBe(true);
  });

  it('can be disabled from the control', () => {
    const { fixture, input, host } = render();

    host.remote.disable();
    fixture.detectChanges();

    expect(input.disabled).toBe(true);
  });
});
