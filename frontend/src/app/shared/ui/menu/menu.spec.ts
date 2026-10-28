import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { keydown } from '../testing';
import { SsMenu, SsMenuItem, SsMenuTrigger } from './menu';

@Component({
  imports: [SsMenuTrigger, SsMenu, SsMenuItem],
  template: `
    <button type="button" class="opener" [ssMenuTriggerFor]="menu">Ana Project</button>
    <ng-template #menu>
      <div ssMenu aria-label="User menu">
        <button ssMenuItem type="button" (click)="picked.push('password')">Change password</button>
        <button ssMenuItem type="button" (click)="picked.push('logout')">Logout</button>
      </div>
    </ng-template>
  `,
})
class Host {
  readonly picked: string[] = [];
}

describe('SsMenu', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('.opener') as HTMLButtonElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const items = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('.cdk-overlay-container [role="menuitem"]'),
      );
    return { fixture, opener, settle, items, host: fixture.componentInstance };
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  it('opens a menu of items from the button, and the button says so', async () => {
    const { opener, settle, items } = await render();

    expect(items()).toHaveLength(0);
    opener.click();
    await settle();

    expect(items().map((item) => item.textContent!.trim())).toEqual(['Change password', 'Logout']);
    expect(document.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('User menu');
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(opener.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('runs the click of an item and closes the menu', async () => {
    const { opener, settle, items, host } = await render();

    opener.click();
    await settle();
    items()[1].click();
    await settle();

    expect(host.picked).toEqual(['logout']);
    expect(items()).toHaveLength(0);
  });

  it('moves between items with the arrow keys and closes with Escape', async () => {
    const { opener, settle, items } = await render();

    opener.click();
    await settle();
    const [first, second] = items();
    first.focus();
    keydown(first, 'ArrowDown');
    await settle();
    expect(document.activeElement).toBe(second);

    keydown(second, 'Escape');
    await settle();
    expect(items()).toHaveLength(0);
  });
});
