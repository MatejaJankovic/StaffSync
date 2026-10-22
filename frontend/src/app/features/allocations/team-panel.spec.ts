import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Project } from '../projects/project.models';
import { Allocation, AllocationStatus, formatPendingChange } from './allocation.models';
import { TeamPanel } from './team-panel';

const PROJECT: Project = {
  id: 5,
  name: 'Project Alpha',
  client: 'Acme Corp',
  description: null,
  startDate: '2026-11-01',
  endDate: '2027-03-31',
  status: 'PLANNED',
  pmId: 7,
  pmName: 'Ana PM',
};

function allocation(
  id: number,
  employeeName: string,
  status: AllocationStatus = 'PROPOSED',
  pending: Partial<Allocation> = {},
): Allocation {
  return {
    id,
    employeeId: 100 + id,
    employeeName,
    projectId: 5,
    projectName: 'Project Alpha',
    requestId: 1,
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

const LIST_URL = '/api/allocations?projectId=5&page=0&size=10';

describe('TeamPanel', () => {
  let fixture: ComponentFixture<TeamPanel>;
  let httpMock: HttpTestingController;

  async function open(
    rows: Allocation[],
    options: { userId?: number; role?: Role; project?: Project } = {},
  ): Promise<void> {
    const { userId = 7, role = 'PM', project = PROJECT } = options;
    await TestBed.configureTestingModule({
      imports: [TeamPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: AuthService,
          useValue: { currentUser: signal({ id: userId }), role: signal(role) },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamPanel);
    fixture.componentRef.setInput('project', project);
    await settle();
    answer(rows);
    await settle();
  }

  function answer(rows: Allocation[], url = LIST_URL): void {
    httpMock.expectOne(url).flush({
      content: rows,
      page: { size: 10, number: 0, totalElements: rows.length, totalPages: 1 },
    });
  }

  afterEach(() => httpMock.verify());

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

  function rowOf(name: string): HTMLElement {
    return [...el().querySelectorAll<HTMLElement>('tr.mat-mdc-row')].find((row) =>
      row.textContent?.includes(name),
    )!;
  }

  it('lists the team with employee, request, percent, period and a status chip', async () => {
    await open([allocation(1, 'Marko Markovic', 'APPROVED'), allocation(2, 'Jelena Jovic')]);

    const marko = rowOf('Marko Markovic');
    expect(marko.textContent).toContain('Java Developer');
    expect(marko.textContent).toContain('60%');
    expect(marko.textContent).toContain('1 Nov 2026 – 31 Jan 2027');
    expect(marko.querySelector('app-status-chip')?.textContent?.trim()).toBe('Approved');
    expect(rowOf('Jelena Jovic').querySelector('app-status-chip')?.textContent?.trim()).toBe(
      'Proposed',
    );
    const headers = [...el().querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Employee',
      'Request',
      'Allocation',
      'Period',
      'Status',
      'Pending change',
    ]);
  });

  it('shows a pending change next to the current values', async () => {
    await open([allocation(1, 'Marko Markovic', 'CHANGE_PENDING', { pendingPercent: 80 })]);

    const marko = rowOf('Marko Markovic');
    expect(marko.textContent).toContain('60% → 80% pending');
    expect(marko.querySelector('app-status-chip')?.textContent?.trim()).toBe('Change pending');
  });

  it('loads the allocations of the project it is given', async () => {
    await open([]);

    fixture.componentRef.setInput('project', { ...PROJECT, id: 6 });
    await settle();

    answer([], '/api/allocations?projectId=6&page=0&size=10');
  });

  it('does not reload when only the details of the same project change', async () => {
    await open([]);

    fixture.componentRef.setInput('project', { ...PROJECT, name: 'Project Alpha 2' });
    await settle();

    httpMock.expectNone(LIST_URL);
  });

  describe('when nobody is listed', () => {
    it('points the PM who owns the project to Find candidates', async () => {
      await open([]);

      expect(el().textContent).toContain('Nobody is on this project yet. Propose someone');
    });

    it.each<[Role, string]>([
      ['RM', 'Nobody from your team is on this project.'],
      ['EMPLOYEE', 'You are not on this project.'],
      ['PM', 'Only the project manager of this project sees its team.'],
      ['ADMIN', 'Nobody is on this project yet.'],
    ])('tells an %s what the empty list means for them', async (role, text) => {
      await open([], { userId: 3, role });

      expect(el().textContent).toContain(text);
      expect(el().textContent).not.toContain('Find candidates');
    });
  });
});

describe('formatPendingChange', () => {
  it('is empty when no change is pending', () => {
    expect(formatPendingChange(allocation(1, 'Marko', 'APPROVED'))).toBe('');
  });

  it('shows only the percent when only the percent changes', () => {
    expect(
      formatPendingChange(
        allocation(1, 'Marko', 'CHANGE_PENDING', {
          pendingPercent: 80,
          pendingStartDate: '2026-11-01',
          pendingEndDate: '2027-01-31',
        }),
      ),
    ).toBe('60% → 80% pending');
  });

  it('shows only the period when only the period changes', () => {
    expect(
      formatPendingChange(
        allocation(1, 'Marko', 'CHANGE_PENDING', {
          pendingPercent: 60,
          pendingStartDate: '2026-11-01',
          pendingEndDate: '2027-02-28',
        }),
      ),
    ).toBe('1 Nov 2026 – 31 Jan 2027 → 1 Nov 2026 – 28 Feb 2027 pending');
  });

  it('shows both when both change', () => {
    expect(
      formatPendingChange(
        allocation(1, 'Marko', 'CHANGE_PENDING', {
          pendingPercent: 40,
          pendingStartDate: '2026-11-15',
          pendingEndDate: '2027-01-31',
        }),
      ),
    ).toBe('60% → 40%, 1 Nov 2026 – 31 Jan 2027 → 15 Nov 2026 – 31 Jan 2027 pending');
  });
});
