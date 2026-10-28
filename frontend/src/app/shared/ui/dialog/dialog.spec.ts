import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { keydown } from '../testing';
import {
  SS_DIALOG_DATA,
  SsDialog,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
} from './dialog';

@Component({
  imports: [SsDialogTitle, SsDialogContent, SsDialogActions, SsDialogClose],
  template: `
    <h2 ssDialogTitle>Edit skill</h2>
    <ss-dialog-content>
      <input class="first" />
      <p class="message">{{ data.message }}</p>
    </ss-dialog-content>
    <ss-dialog-actions>
      <button type="button" class="cancel" [ssDialogClose]="false">Cancel</button>
      <button type="button" class="save" [ssDialogClose]="'saved'">Save</button>
      <button type="button" class="bare" ssDialogClose>Close</button>
      <button type="button" class="manual" (click)="ref.close('manual')">Manual</button>
    </ss-dialog-actions>
  `,
})
class TestDialog {
  protected readonly data = inject<{ message: string }>(SS_DIALOG_DATA);
  protected readonly ref = inject<SsDialogRef<TestDialog, string | boolean>>(SsDialogRef);
}

describe('SsDialog', () => {
  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  function container(): HTMLElement | null {
    return document.querySelector('.cdk-dialog-container');
  }

  function click(selector: string) {
    document.querySelector<HTMLElement>(selector)!.click();
  }

  async function open(config: Parameters<SsDialog['open']>[1] = { data: { message: 'Hello' } }) {
    const dialog = TestBed.inject(SsDialog);
    const ref = dialog.open<TestDialog, unknown, string | boolean>(TestDialog, config);
    const results: unknown[] = [];
    ref.afterClosed().subscribe((result) => results.push(result));
    await settle();
    return { ref, results };
  }

  afterEach(() => {
    TestBed.inject(SsDialog); // the root service closes nothing by itself
    document.querySelectorAll('.cdk-overlay-container > *').forEach((node) => node.remove());
  });

  it('opens the component as a modal dialog with the data and the title as its name', async () => {
    await open({ data: { message: 'Hello' }, width: '420px' });
    const dialog = container()!;

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(document.querySelector('h2')!.id);
    expect(document.querySelector('.message')!.textContent).toBe('Hello');
    expect(document.querySelector<HTMLElement>('.cdk-overlay-pane')!.style.width).toBe('420px');
    expect(document.querySelector('.ss-dialog-backdrop')).not.toBeNull();
  });

  it('lets an overlay open over the content follow it when the content scrolls', async () => {
    await open();
    const scrolled = vi.fn();
    const subscription = TestBed.inject(ScrollDispatcher).scrolled(0).subscribe(scrolled);

    document.querySelector('ss-dialog-content')!.dispatchEvent(new Event('scroll'));

    expect(scrolled).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('puts focus in the dialog, and gives it back to the opener when closed', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { ref } = await open();
    // jsdom has no layout, so the CDK cannot see which element is tabbable and focuses the dialog
    // itself; in a browser it focuses the first control. Either way focus is inside the dialog.
    expect(container()!.contains(document.activeElement)).toBe(true);

    ref.close();
    await settle();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes with the result of ssDialogClose, and with none for a bare ssDialogClose', async () => {
    const first = await open();
    click('.save');
    await settle();
    expect(first.results).toEqual(['saved']);
    expect(container()).toBeNull();

    const second = await open();
    click('.cancel');
    await settle();
    expect(second.results).toEqual([false]);

    const third = await open();
    click('.bare');
    await settle();
    expect(third.results).toEqual([undefined]);
  });

  it('closes through the injected SsDialogRef', async () => {
    const { results } = await open();

    click('.manual');
    await settle();

    expect(results).toEqual(['manual']);
  });

  it('closes on Escape and on a click outside, with no result', async () => {
    const escape = await open();
    keydown(container()!, 'Escape');
    await settle();
    expect(escape.results).toEqual([undefined]);
    expect(container()).toBeNull();

    const outside = await open();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await settle();
    expect(outside.results).toEqual([undefined]);
  });

  it('stays open on Escape and on a click outside when disableClose is set', async () => {
    const { results } = await open({ data: { message: 'x' }, disableClose: true });

    keydown(container()!, 'Escape');
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await settle();

    expect(container()).not.toBeNull();
    expect(results).toEqual([]);
  });

  it('can be locked and unlocked while it is open, like a save in progress', async () => {
    const { ref, results } = await open();

    ref.disableClose = true;
    keydown(container()!, 'Escape');
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await settle();
    expect(container()).not.toBeNull();
    expect(ref.disableClose).toBe(true);

    ref.disableClose = false;
    keydown(container()!, 'Escape');
    await settle();
    expect(container()).toBeNull();
    expect(results).toEqual([undefined]);
  });

  it('closes every open dialog with closeAll', async () => {
    const first = await open();
    const second = await open();

    TestBed.inject(SsDialog).closeAll();
    await settle();

    expect(container()).toBeNull();
    expect(first.results).toEqual([undefined]);
    expect(second.results).toEqual([undefined]);
  });

  it('gives a close button a plain ss-dialog-close attribute to find it by', async () => {
    await open();

    expect(document.querySelectorAll('button[ss-dialog-close]')).toHaveLength(3);
    expect(document.querySelector('.save')!.hasAttribute('ss-dialog-close')).toBe(true);
    expect(document.querySelector('.manual')!.hasAttribute('ss-dialog-close')).toBe(false);
  });

  it('aligns the actions row to the end by default, and as asked', async () => {
    await open();

    expect(document.querySelector('ss-dialog-actions')!.className).toContain(
      'ss-dialog__actions--end',
    );
  });

  it('names a dialog without a title with ariaLabel', async () => {
    await open({ data: { message: 'x' }, ariaLabel: 'Pick a date' });

    expect(container()!.getAttribute('aria-label')).toBe('Pick a date');
  });
});
