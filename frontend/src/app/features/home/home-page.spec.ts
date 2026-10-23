import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardCard } from './dashboard.models';
import { DASHBOARD_URL } from './dashboard.service';
import { HomePage } from './home-page';

const EMPLOYEE_CARDS: DashboardCard[] = [
  { key: 'currentLoad', label: 'Current load', value: '60%', date: null, link: '/my-allocations' },
  {
    key: 'activeProjects',
    label: 'Active projects',
    value: '1',
    date: null,
    link: '/my-allocations',
  },
  {
    key: 'nextAllocation',
    label: 'Next allocation',
    value: 'Project Alpha',
    date: '2026-11-01',
    link: '/my-allocations',
  },
];

const ADMIN_CARDS: DashboardCard[] = [
  { key: 'activeUsers', label: 'Active users', value: '37', date: null, link: '/admin/users' },
  { key: 'activeProjects', label: 'Active projects', value: '5', date: null, link: null },
  { key: 'skills', label: 'Skills in the catalog', value: '25', date: null, link: '/admin/skills' },
];

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function flush(cards: DashboardCard[]): Promise<void> {
    httpMock.expectOne(DASHBOARD_URL).flush(cards);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function cards(): HTMLElement[] {
    return [...el().querySelectorAll<HTMLElement>('app-stat-card')];
  }

  function text(card: HTMLElement, part: string): string | undefined {
    return card.querySelector(`.stat-card__${part}`)?.textContent?.trim();
  }

  it('shows a loading message until the cards arrive', async () => {
    expect(el().textContent).toContain('Loading your overview…');

    await flush(EMPLOYEE_CARDS);

    expect(el().textContent).not.toContain('Loading');
  });

  it('shows one card per item, in the order of the API', async () => {
    await flush(EMPLOYEE_CARDS);

    expect(cards().map((card) => text(card, 'label'))).toEqual([
      'Current load',
      'Active projects',
      'Next allocation',
    ]);
    expect(cards().map((card) => text(card, 'value'))).toEqual(['60%', '1', 'Project Alpha']);
  });

  it('shows the start of the next allocation day first', async () => {
    await flush(EMPLOYEE_CARDS);

    expect(text(cards()[2], 'caption')).toBe('From 1 Nov 2026');
    expect(text(cards()[0], 'caption')).toBeUndefined();
  });

  it('links each card to its list, and a card without a link is not clickable', async () => {
    await flush(ADMIN_CARDS);

    expect(cards().map((card) => card.querySelector('a')?.getAttribute('href') ?? null)).toEqual([
      '/admin/users',
      null,
      '/admin/skills',
    ]);
  });

  it('shows an error with Retry, which loads the cards again', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to load your overview.',
    );
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await flush(ADMIN_CARDS);

    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(cards()).toHaveLength(3);
  });
});
