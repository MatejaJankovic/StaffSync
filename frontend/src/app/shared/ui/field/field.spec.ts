import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SsError, SsField, SsHint, SsInput, SsLabel } from './field';

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsInput, SsHint, SsError],
  template: `
    <form [formGroup]="form" (ngSubmit)="submitted = true">
      <ss-field>
        <ss-label>Email</ss-label>
        <input ssInput formControlName="email" />
        <ss-hint>Used to sign in</ss-hint>
        @if (form.controls.email.hasError('required')) {
          <ss-error>Email is required</ss-error>
        }
      </ss-field>
      <ss-field>
        <ss-label>Note</ss-label>
        <textarea ssInput formControlName="note"></textarea>
      </ss-field>
      <button type="submit">Save</button>
    </form>
  `,
})
class Host {
  submitted = false;
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true }),
  });
}

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsInput, SsHint, SsError],
  template: `
    <ss-field>
      <ss-label>Confirm</ss-label>
      <input ssInput [formControl]="confirm" [errorStateMatcher]="matcher" />
      <ss-hint>Pick one</ss-hint>
      <ss-error>Does not match</ss-error>
    </ss-field>
  `,
})
class MatcherHost {
  broken = true;
  readonly confirm = new FormControl('');
  readonly matcher = { isErrorState: () => this.broken };
}

describe('SsField', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      el,
      input: el.querySelector<HTMLInputElement>('input')!,
      field: el.querySelector<HTMLElement>('ss-field')!,
      sub: () => el.querySelector('.ss-field__sub')!.textContent?.trim(),
    };
  }

  it('connects the label to the input and marks a required field with a *', () => {
    const { el, input } = render();
    const label = el.querySelector('label')!;

    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.id).toMatch(/^ss-input-/);
    expect(label.textContent).toContain('Email');
    expect(el.querySelector('.ss-field__head .ss-field__required')?.textContent).toBe('*');
    // The second field has no required validator
    expect(el.querySelectorAll('ss-field')[1].querySelector('.ss-field__required')).toBeNull();
  });

  it('shows the hint, and no error, until the control is touched', () => {
    const { fixture, input, field, sub } = render();

    expect(sub()).toBe('Used to sign in');
    expect(field.classList).not.toContain('ss-field--invalid');
    expect(input.getAttribute('aria-invalid')).toBe('false');

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(sub()).toBe('Email is required');
    expect(field.classList).toContain('ss-field--invalid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the error when the form is submitted untouched, and the hint again once valid', () => {
    const { fixture, el, input, sub } = render();

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(sub()).toBe('Email is required');

    input.value = 'ana@example.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(sub()).toBe('Used to sign in');
  });

  it('points the input at the hint or error area for screen readers', () => {
    const { el, input } = render();

    expect(input.getAttribute('aria-describedby')).toBe(el.querySelector('.ss-field__sub')!.id);
  });

  it('marks the field focused while the input has focus, and disabled when it is disabled', () => {
    const { fixture, input, field } = render();

    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(field.classList).toContain('ss-field--focused');

    input.dispatchEvent(new Event('blur'));
    fixture.componentInstance.form.controls.email.disable();
    fixture.detectChanges();
    expect(field.classList).not.toContain('ss-field--focused');
    expect(field.classList).toContain('ss-field--disabled');
  });

  it('uses a custom error rule when one is given, instead of invalid and touched', () => {
    const fixture = TestBed.createComponent(MatcherHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    const sub = () => el.querySelector('.ss-field__sub')!.textContent!.trim();

    // Untouched and valid, yet the rule says error: shows the error, not the hint
    expect(sub()).toBe('Does not match');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fixture.componentInstance.broken = false;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(sub()).toBe('Pick one');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('moves focus to the input when the label is clicked', () => {
    const { el, input } = render();

    el.querySelector('label')!.click();

    expect(document.activeElement).toBe(input);
  });

  it('announces the message: the live region exists before the text and is not on the error', () => {
    const { fixture, el, input } = render();
    const sub = el.querySelector('.ss-field__sub')!;

    expect(sub.getAttribute('aria-live')).toBe('polite');
    expect(sub.getAttribute('aria-atomic')).toBe('true');

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    // Same element as before the error appeared, so a screen reader announces the new text
    expect(el.querySelector('.ss-field__sub')).toBe(sub);
    expect(sub.querySelector('ss-error')?.getAttribute('aria-live')).toBeNull();
  });

  it('tells assistive tech that a required input is required, without the native attribute', () => {
    const { el, input } = render();
    const note = el.querySelector<HTMLTextAreaElement>('textarea')!;

    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.required).toBe(false);
    expect(note.getAttribute('aria-required')).toBe('false');
  });
});
