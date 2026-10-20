import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    service = TestBed.inject(ConfirmDialogService);
  });

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  function open(destructive = false): { result: () => boolean | undefined } {
    let result: boolean | undefined;
    service
      .confirm({
        title: 'Cancel allocation?',
        message: 'Marko will be removed from the project.',
        confirmText: 'Cancel allocation',
        cancelText: 'Keep',
        destructive,
      })
      .subscribe((value) => (result = value));
    TestBed.tick();
    return { result: () => result };
  }

  function dialog(): HTMLElement {
    return document.querySelector('app-confirm-dialog') as HTMLElement;
  }

  function button(text: string): HTMLButtonElement {
    return [...dialog().querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement;
  }

  async function settle(): Promise<void> {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('shows the title, message and button labels', () => {
    open();
    expect(dialog().querySelector('h2')?.textContent).toContain('Cancel allocation?');
    expect(dialog().textContent).toContain('Marko will be removed from the project.');
    expect(button('Keep')).toBeTruthy();
    expect(button('Cancel allocation')).toBeTruthy();
  });

  it('emits true on confirm', async () => {
    const { result } = open();
    button('Cancel allocation').click();
    await settle();
    expect(result()).toBe(true);
  });

  it('emits false on cancel', async () => {
    const { result } = open();
    button('Keep').click();
    await settle();
    expect(result()).toBe(false);
  });

  it('emits false when closed without a choice (Escape, click outside)', async () => {
    const { result } = open();
    TestBed.inject(MatDialog).closeAll();
    await settle();
    expect(result()).toBe(false);
  });

  it('marks the confirm button as destructive only when asked', () => {
    open(true);
    expect(button('Cancel allocation').classList).toContain('confirm-dialog__confirm--destructive');
  });

  it('uses Confirm and Cancel by default', () => {
    service.confirm({ title: 'Sure?', message: 'Really?' }).subscribe();
    TestBed.tick();
    expect(button('Confirm')).toBeTruthy();
    expect(button('Cancel')).toBeTruthy();
    expect(button('Confirm').classList).not.toContain('confirm-dialog__confirm--destructive');
  });
});
