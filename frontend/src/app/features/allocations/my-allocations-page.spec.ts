import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Availability } from '../users/user.models';
import { Allocation, AllocationStatus } from './allocation.models';
import { MyAllocationsPage } from './my-allocations-page';

const ME = 4;
const LIST_URL = '/api/allocations?page=0&size=20';
const AVAILABILITY_URL = `/api/users/${ME}/availability`;

function allocation(
  id: number,
  projectName: string,
  status: AllocationStatus = 'APPROVED',
  pending: Partial<Allocation> = {},
): Allocation {
  return {
    id,
    employeeId: ME,
    employeeName: 'Bogdan Vujic',
    projectId: 10 + id,
    projectName,
    requestId: 20 + id,
    requestTitle: 'Java Developer',
    percent: 60,
    startDate: '2026-11-01',
    endDate: '2027-01-31',
    status,
    createdAt: '2026-10-22T09:15:30Z',
    pendingPercent: null,
    pendingStartDate: null,
    pendingEndDate: null,
    changeReason: null,
    ...pending,
  };
}

function availability(days: [string, number][], capacityPercent = 100): Availability {
  return {
    employeeId: ME,
    capacityPercent,
    from: days[0]?.[0] ?? '',
    to: days.at(-1)?.[0] ?? '',
    days: days.map(([date, load]) => ({ date, load, free: capacityPercent - load })),
  };
}

// Friday 23 Oct 2026: the week from today holds Fri, Mon to Thu
const FRIDAY = availability([
  ['2026-10-23', 60],
  ['2026-10-26', 90],
  ['2026-10-27', 90],
  ['2026-10-28', 90],
  ['2026-10-29', 90],
]);

describe('MyAllocationsPage', () => {
  let fixture: ComponentFixture<MyAllocationsPage>;
  let httpMock: HttpTestingController;

  async function open(today: string): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T10:00:00`));
    await TestBed.configureTestingModule({
      imports: [MyAllocationsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: ME }) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MyAllocationsPage);
    await settle();
  }

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | undefined {
    return el().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  }

  function column(name: string): (string | undefined)[] {
    return [...el().querySelectorAll(`td.mat-column-${name}`)].map((cell) =>
      cell.textContent?.replace(/\s+/g, ' ').trim(),
    );
  }

  function answerLoad(body: Availability, from: string, to: string): void {
    const request = httpMock.expectOne((req) => req.url === AVAILABILITY_URL);
    expect(request.request.params.get('from')).toBe(from);
    expect(request.request.params.get('to')).toBe(to);
    request.flush(body);
  }

  function answerList(rows: Allocation[]): void {
    httpMock.expectOne(LIST_URL).flush({
      content: rows,
      page: { size: 20, number: 0, totalElements: rows.length, totalPages: 1 },
    });
  }

  describe('current load', () => {
    beforeEach(async () => {
      await open('2026-10-23');
      answerList([]);
      await settle();
    });

    it('shows a loading message until the load arrives', async () => {
      expect(text('.my-allocations__load')).toContain('Loading your load…');

      answerLoad(FRIDAY, '2026-10-23', '2026-10-29');
      await settle();

      expect(text('.my-allocations__load')).not.toContain('Loading');
    });

    it("shows today's load against my capacity", async () => {
      answerLoad(FRIDAY, '2026-10-23', '2026-10-29');
      await settle();

      expect(text('app-capacity-bar')).toBe('60% / 100%');
    });

    it('says in words when I am over capacity', async () => {
      answerLoad(availability([['2026-10-23', 60]], 50), '2026-10-23', '2026-10-29');
      await settle();

      expect(text('app-capacity-bar')).toBe('60% / 50% Over capacity');
    });

    it('shows an error with Retry, and loads again on Retry', async () => {
      httpMock
        .expectOne((req) => req.url === AVAILABILITY_URL)
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('.my-allocations__load [role="alert"]')).toContain(
        'Unable to load your current load.',
      );
      expect(el().querySelector('app-paged-table')).not.toBeNull();

      el().querySelector<HTMLButtonElement>('.my-allocations__load button')!.click();
      await settle();
      answerLoad(FRIDAY, '2026-10-23', '2026-10-29');
      await settle();

      expect(text('app-capacity-bar')).toBe('60% / 100%');
    });
  });

  it("shows next Monday's load on a weekend", async () => {
    await open('2026-10-24');
    answerList([]);
    answerLoad(
      availability([
        ['2026-10-26', 90],
        ['2026-10-27', 90],
        ['2026-10-28', 90],
        ['2026-10-29', 90],
        ['2026-10-30', 90],
      ]),
      '2026-10-24',
      '2026-10-30',
    );
    await settle();

    expect(text('app-capacity-bar')).toBe('90% / 100%');
  });

  describe('list', () => {
    beforeEach(async () => {
      await open('2026-10-23');
      answerLoad(FRIDAY, '2026-10-23', '2026-10-29');
    });

    it('lists my allocations with project, request, %, period and status', async () => {
      answerList([allocation(1, 'Project Alpha'), allocation(2, 'Project Beta', 'PROPOSED')]);
      await settle();

      expect(column('project')).toEqual(['Project Alpha', 'Project Beta']);
      expect(column('request')).toEqual(['Java Developer', 'Java Developer']);
      expect(column('percent')).toEqual(['60%', '60%']);
      expect(column('startDate')).toEqual(['1 Nov 2026 – 31 Jan 2027', '1 Nov 2026 – 31 Jan 2027']);
      expect(column('status')).toEqual(['Approved', 'Proposed']);
    });

    it('links each project to its details', async () => {
      answerList([allocation(1, 'Project Alpha')]);
      await settle();

      expect(el().querySelector('td.mat-column-project a')?.getAttribute('href')).toBe(
        '/projects/11',
      );
    });

    it('shows a change waiting for the RM', async () => {
      answerList([
        allocation(1, 'Project Alpha', 'CHANGE_PENDING', { pendingPercent: 80 }),
        allocation(2, 'Project Beta'),
      ]);
      await settle();

      expect(column('pendingChange')).toEqual(['60% → 80% pending', '']);
      expect(column('status')).toEqual(['Change pending', 'Approved']);
    });

    it('says so when I have no allocations', async () => {
      answerList([]);
      await settle();

      expect(el().textContent).toContain('You have no allocations yet');
    });
  });
});
