import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SsIcon } from '../icon/icon';
import { SsButton } from './button';

@Component({
  imports: [SsButton, SsIcon],
  template: `
    <button ss-button="filled" type="submit">Save changes</button>
    <button ss-button="outlined" type="button">Retry</button>
    <button ss-button type="button">Cancel</button>
    <button ss-button="icon" type="button" aria-label="Edit"><ss-icon>edit</ss-icon></button>
    <button ss-button="filled" class="ss-button-danger" type="button" disabled>Delete</button>
    <a ss-button="outlined" href="/projects">Open</a>
  `,
})
class Host {}

describe('SsButton and SsIcon', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('styles the variant named by the attribute, and a bare ss-button as a text button', () => {
    const el = render();
    const [filled, outlined, text, icon] = Array.from(el.querySelectorAll('button'));

    expect(filled.className).toContain('ss-button--filled');
    expect(outlined.className).toContain('ss-button--outlined');
    expect(text.className).toContain('ss-button--text');
    expect(icon.className).toContain('ss-button--icon');
    expect(filled.className).toContain('ss-button');
  });

  it('keeps the content, the type and a link as a link', () => {
    const el = render();

    expect(el.querySelector('button')!.textContent).toContain('Save changes');
    expect(el.querySelector('button')!.getAttribute('type')).toBe('submit');
    expect(el.querySelector('a')!.className).toContain('ss-button--outlined');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/projects');
  });

  it('keeps native disabled and an extra danger class', () => {
    const el = render();
    const danger = el.querySelector<HTMLButtonElement>('.ss-button-danger')!;

    expect(danger.disabled).toBe(true);
    expect(danger.className).toContain('ss-button--filled');
  });

  it('renders an icon by its ligature name, hidden from screen readers', () => {
    const el = render();
    const icon = el.querySelector('ss-icon')!;

    expect(icon.textContent).toBe('edit');
    expect(icon.classList).toContain('material-symbols-outlined');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('button[aria-label="Edit"]')).not.toBeNull();
  });
});
