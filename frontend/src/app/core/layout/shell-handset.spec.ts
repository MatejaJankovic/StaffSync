import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { keydown } from '../../shared/ui/testing';
import { Shell } from './shell';

@Component({ template: '' })
class Page {}

describe('Shell on a handset', () => {
  let fixture: ComponentFixture<Shell>;
  let httpMock: HttpTestingController;
  let handset: BehaviorSubject<{ matches: boolean; breakpoints: Record<string, boolean> }>;

  async function render(matches = true): Promise<HTMLElement> {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem(
      'staffsync.user',
      JSON.stringify({ id: 1, email: 'x@y.z', firstName: 'Ana', lastName: 'Project', role: 'PM' }),
    );
    handset = new BehaviorSubject({ matches, breakpoints: {} });
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'home', component: Page },
          { path: 'projects', component: Page },
        ]),
        { provide: BreakpointObserver, useValue: { observe: () => handset } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Shell);
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function menuButton(el: HTMLElement): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('.shell__menu-button')!;
  }

  afterEach(() => httpMock.verify());

  it('shows a top bar with a menu button and no drawer until it is opened', async () => {
    const el = await render();

    expect(menuButton(el).getAttribute('aria-expanded')).toBe('false');
    expect(menuButton(el).getAttribute('aria-controls')).toBe('shell-drawer');
    expect(el.querySelector('.shell__sidebar')).toBeNull();
    expect(el.querySelector('.shell__drawer')).toBeNull();
    expect(el.querySelector('.shell__collapse')).toBeNull();
  });

  it('opens the menu in a modal drawer, and closes it with the button again', async () => {
    const el = await render();

    menuButton(el).click();
    await settle();

    const drawer = el.querySelector('.shell__drawer')!;
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(menuButton(el).getAttribute('aria-expanded')).toBe('true');
    expect(
      [...drawer.querySelectorAll('.shell__link-label')].map((label) => label.textContent!.trim()),
    ).toEqual(['Home', 'My projects', 'Employee search']);
    expect(el.querySelector('.shell__scrim')).not.toBeNull();

    menuButton(el).click();
    await settle();

    expect(el.querySelector('.shell__drawer')).toBeNull();
    expect(el.querySelector('.shell__scrim')).toBeNull();
    expect(menuButton(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and gives focus back to the menu button', async () => {
    const el = await render();
    document.body.append(el);
    menuButton(el).focus();
    menuButton(el).click();
    await settle();

    keydown(el.querySelector('.shell__drawer')!, 'Escape');
    await settle();

    expect(el.querySelector('.shell__drawer')).toBeNull();
    expect(document.activeElement).toBe(menuButton(el));
    el.remove();
  });

  it('closes on a click outside the drawer', async () => {
    const el = await render();
    menuButton(el).click();
    await settle();

    el.querySelector<HTMLElement>('.shell__scrim')!.click();
    await settle();

    expect(el.querySelector('.shell__drawer')).toBeNull();
  });

  it('closes when a page is chosen', async () => {
    const el = await render();
    menuButton(el).click();
    await settle();

    const link = [...el.querySelectorAll<HTMLAnchorElement>('.shell__link')].find((a) =>
      a.textContent!.includes('My projects'),
    )!;
    link.click();
    await fixture.whenStable();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/projects');
    expect(el.querySelector('.shell__drawer')).toBeNull();
  });

  it('puts the drawer away when the window grows to a desktop', async () => {
    const el = await render();
    menuButton(el).click();
    await settle();

    handset.next({ matches: false, breakpoints: {} });
    await settle();

    expect(el.querySelector('.shell__drawer')).toBeNull();
    expect(el.querySelector('.shell__sidebar')).not.toBeNull();
    expect(el.querySelector('.shell__menu-button')).toBeNull();
  });
});

describe('Shell navigation', () => {
  let fixture: ComponentFixture<Shell>;
  let httpMock: HttpTestingController;

  async function render(): Promise<HTMLElement> {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem(
      'staffsync.user',
      JSON.stringify({ id: 1, email: 'x@y.z', firstName: 'Ana', lastName: 'Project', role: 'PM' }),
    );
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'home', component: Page },
          { path: 'projects', component: Page },
        ]),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => httpMock.verify());

  it('is a navigation landmark that marks only the current page', async () => {
    const el = await render();
    await TestBed.inject(Router).navigateByUrl('/projects');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('nav')!.getAttribute('aria-label')).toBe('Main menu');
    const current = [...el.querySelectorAll('.shell__nav a[aria-current="page"]')];
    expect(current.map((a) => a.querySelector('.shell__link-label')!.textContent!.trim())).toEqual([
      'My projects',
    ]);
    expect(current[0].classList).toContain('shell__link--active');
  });
});
