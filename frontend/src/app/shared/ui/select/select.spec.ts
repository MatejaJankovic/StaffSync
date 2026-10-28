import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SsError, SsField, SsLabel } from '../field/field';
import { keydown } from '../testing';
import { SsOptgroup, SsOption, SsSelect } from './select';

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsError, SsSelect, SsOption, SsOptgroup],
  template: `
    <ss-field>
      <ss-label>Role</ss-label>
      <ss-select
        [formControl]="role"
        placeholder="Choose a role"
        (selectionChange)="changes.push($event.value)"
      >
        <ss-optgroup label="Staff">
          <ss-option value="EMPLOYEE">Employee</ss-option>
          <ss-option value="PM">Project manager</ss-option>
        </ss-optgroup>
        <ss-option value="ADMIN">Administrator</ss-option>
        <ss-option value="LOCKED" disabled>Locked</ss-option>
      </ss-select>
      @if (role.hasError('required')) {
        <ss-error>Role is required</ss-error>
      }
    </ss-field>
  `,
})
class FormHost {
  readonly changes: unknown[] = [];
  readonly role = new FormControl<string | null>(null, Validators.required);
}

@Component({
  imports: [SsSelect, SsOption],
  template: `
    <ss-select ariaLabel="Status" [value]="status()" (selectionChange)="status.set($event.value)">
      <ss-option [value]="null">Any</ss-option>
      <ss-option [value]="true">Active</ss-option>
      <ss-option [value]="false">Inactive</ss-option>
    </ss-select>
  `,
})
class StandaloneHost {
  readonly status = signal<boolean | null>(null);
}

@Component({
  imports: [ReactiveFormsModule, SsField, SsLabel, SsSelect, SsOption],
  template: `
    <ss-field>
      <ss-label>Role</ss-label>
      <ss-select [formControl]="role" [errorStateMatcher]="matcher">
        <ss-option value="PM">Project manager</ss-option>
      </ss-select>
    </ss-field>
  `,
})
class MatcherHost {
  readonly role = new FormControl<string | null>('PM');
  readonly matcher = { isErrorState: () => true };
}

function overlay(): HTMLElement {
  return document.querySelector('.cdk-overlay-container') as HTMLElement;
}

describe('SsSelect', () => {
  afterEach(() => {
    // Close anything a test left open so the next test starts clean
    TestBed.resetTestingModule();
    overlay()?.replaceChildren();
  });

  async function render() {
    const fixture = TestBed.createComponent(FormHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLElement>('[role="combobox"]')!;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const options = () => Array.from(overlay().querySelectorAll<HTMLElement>('[role="option"]'));
    const press = async (key: string) => {
      keydown(trigger, key);
      await settle();
    };
    const activeText = () => overlay().querySelector('.ss-option--active')?.textContent?.trim();
    return {
      fixture,
      el,
      trigger,
      settle,
      options,
      press,
      activeText,
      host: fixture.componentInstance,
    };
  }

  it('shows the placeholder, and is a combobox named by the field label', async () => {
    const { el, trigger } = await render();

    expect(trigger.textContent).toContain('Choose a role');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-required')).toBe('true');
    expect(trigger.getAttribute('aria-labelledby')).toBe(el.querySelector('label')!.id);
    expect(el.querySelector('label')!.getAttribute('for')).toBe(trigger.id);
  });

  it('opens a listbox with the options and their group on click', async () => {
    const { trigger, settle, options } = await render();

    trigger.click();
    await settle();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(overlay().querySelector('[role="listbox"]')).not.toBeNull();
    expect(options().map((o) => o.textContent!.trim())).toEqual([
      'Employee',
      'Project manager',
      'Administrator',
      'Locked',
    ]);
    expect(overlay().querySelector('[role="group"]')!.textContent).toContain('Staff');
    expect(options()[3].getAttribute('aria-disabled')).toBe('true');
  });

  it('picks an option with a click: writes the control, shows its text, closes, and marks touched', async () => {
    const { trigger, settle, options, host } = await render();

    trigger.click();
    await settle();
    options()[1].click();
    await settle();

    expect(host.role.value).toBe('PM');
    expect(host.role.touched).toBe(true);
    expect(host.changes).toEqual(['PM']);
    expect(trigger.textContent).toContain('Project manager');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(overlay().querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not pick a disabled option', async () => {
    const { trigger, settle, options, host } = await render();

    trigger.click();
    await settle();
    options()[3].click();
    await settle();

    expect(host.role.value).toBeNull();
    expect(overlay().querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('opens with the arrow keys and picks with the keyboard, skipping the disabled option', async () => {
    const { trigger, press, activeText, host } = await render();
    trigger.focus();

    await press('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // First option is active; the trigger names it for screen readers
    expect(activeText()).toBe('Employee');
    expect(overlay().querySelector('.ss-option--active')!.id).toBe(
      trigger.getAttribute('aria-activedescendant'),
    );

    await press('ArrowDown');
    expect(activeText()).toBe('Project manager');
    await press('ArrowDown');
    expect(activeText()).toBe('Administrator');
    await press('ArrowDown'); // wraps past the disabled "Locked" back to the first
    expect(activeText()).toBe('Employee');
    await press('ArrowUp'); // and back, skipping "Locked" again
    expect(activeText()).toBe('Administrator');
    await press('Enter');

    expect(host.role.value).toBe('ADMIN');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('jumps with Home and End, and finds an option by typing', async () => {
    const { trigger, press, activeText, settle, host } = await render();
    trigger.focus();

    await press('Enter');
    await press('End');
    expect(activeText()).toBe('Administrator'); // End skips the disabled last option
    await press('Home');
    expect(activeText()).toBe('Employee');
    await press('p');
    await new Promise((resolve) => setTimeout(resolve, 300)); // the CDK debounces type-ahead
    await settle();
    expect(activeText()).toBe('Project manager'); // typing finds the option by its text
    await press('Enter');

    expect(host.role.value).toBe('PM');
  });

  it('closes with Escape or Tab without changing the value', async () => {
    const { trigger, press, host } = await render();
    trigger.focus();

    await press('ArrowDown');
    await press('ArrowDown');
    await press('Escape');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await press('ArrowDown');
    await press('Tab');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.role.value).toBeNull();
  });

  it('shows the error after the select was opened and closed with nothing picked', async () => {
    const { el, trigger, press } = await render();
    trigger.focus();

    expect(el.querySelector('ss-error')).toBeNull();
    await press('ArrowDown');
    await press('Escape');

    expect(el.querySelector('ss-error')?.textContent).toContain('Role is required');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the value written to the control, marks it selected, and can be disabled', async () => {
    const { fixture, trigger, settle, options, host } = await render();

    host.role.setValue('ADMIN');
    await settle();
    expect(trigger.querySelector('.ss-select__value')!.textContent!.trim()).toBe('Administrator');

    trigger.click();
    await settle();
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
    // The check mark is drawn, not typed: the option's whole text is just its label
    expect(options()[2].textContent!.trim()).toBe('Administrator');

    trigger.click();
    host.role.disable();
    await settle();
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    trigger.click();
    await settle();
    expect(overlay().querySelector('[role="listbox"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ss-field--disabled')).not.toBeNull();
  });

  it('opens and closes from code with open() and close(), like a native control', async () => {
    const { fixture, trigger, settle, options } = await render();
    const select = fixture.debugElement.query(By.directive(SsSelect)).componentInstance as SsSelect;

    select.open();
    await settle();
    expect(select.isOpen()).toBe(true);
    expect(options()).toHaveLength(4);

    select.close();
    await settle();
    expect(select.isOpen()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(options()).toHaveLength(0);
  });

  it('shows its error by a custom rule when one is given', async () => {
    const fixture = TestBed.createComponent(MatcherHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLElement>('[role="combobox"]')!;

    // Valid control, but the matcher says error (e.g. an error of the whole form)
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('ss-field')!.classList).toContain('ss-field--invalid');
  });

  it('works without a form: [value] in, selectionChange out, null as a real choice', async () => {
    const fixture = TestBed.createComponent(StandaloneHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLElement;

    expect(trigger.textContent).toContain('Any');
    expect(trigger.getAttribute('aria-label')).toBe('Status');

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    (overlay().querySelectorAll('[role="option"]')[2] as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.status()).toBe(false);
    expect(trigger.textContent).toContain('Inactive');
  });
});
