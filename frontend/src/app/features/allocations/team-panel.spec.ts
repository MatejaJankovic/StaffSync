import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of } from 'rxjs';
import { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { toIsoDate } from '../../shared/dates';
import { Project } from '../projects/project.models';
import {
  Allocation,
  AllocationStatus,
  formatPendingChange,
  isCancellable,
  isWithdrawable,
} from './allocation.models';
import { TeamPanel } from './team-panel';

// Relative to when the tests run, because whether an allocation has started depends on today
const TODAY = toIsoDate(new Date());
const LATER = '2099-01-05';
const EARLIER = '2020-01-06';

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
  let confirm: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;
  let changed: ReturnType<typeof vi.fn<(allocation: Allocation) => void>>;

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
    confirm = vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockReturnValue(of(true));
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    fixture = TestBed.createComponent(TeamPanel);
    changed = vi.fn<(allocation: Allocation) => void>();
    fixture.componentInstance.changed.subscribe(changed);
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

  function action(row: HTMLElement, label: string): HTMLButtonElement | null {
    return row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
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
      '',
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

  describe('withdraw and cancel (US-12), for the PM who owns the project', () => {
    it('offers Withdraw on a proposal, even one whose start date has passed', async () => {
      await open([allocation(1, 'Jelena Jovic', 'PROPOSED', { startDate: EARLIER })]);

      const jelena = rowOf('Jelena Jovic');
      expect(action(jelena, 'Withdraw Jelena Jovic')?.textContent?.trim()).toBe('Withdraw');
      expect(action(jelena, 'Cancel Jelena Jovic')).toBeNull();
    });

    it('offers Cancel on an approved allocation that has not started', async () => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);

      const marko = rowOf('Marko Markovic');
      expect(action(marko, 'Cancel Marko Markovic')?.textContent?.trim()).toBe('Cancel');
      expect(action(marko, 'Withdraw Marko Markovic')).toBeNull();
    });

    it.each([
      ['today', TODAY],
      ['earlier', EARLIER],
    ])('offers no Cancel on an approved allocation that started %s', async (_when, startDate) => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate })]);

      expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
    });

    it.each<AllocationStatus>(['CHANGE_PENDING', 'REJECTED', 'CANCELLED'])(
      'offers no action on a %s allocation',
      async (status) => {
        await open([allocation(1, 'Marko Markovic', status, { startDate: LATER })]);

        expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
      },
    );

    it('asks before withdrawing, then withdraws, reloads the team and tells the page', async () => {
      await open([allocation(2, 'Jelena Jovic')]);

      action(rowOf('Jelena Jovic'), 'Withdraw Jelena Jovic')!.click();
      await settle();

      expect(confirm).toHaveBeenCalledWith({
        title: 'Withdraw proposal?',
        message: 'Jelena Jovic will no longer be proposed for Java Developer.',
        confirmText: 'Withdraw proposal',
        cancelText: 'Keep',
        destructive: true,
      });
      const cancelled = allocation(2, 'Jelena Jovic', 'CANCELLED');
      httpMock.expectOne({ method: 'POST', url: '/api/allocations/2/cancel' }).flush(cancelled);
      await settle();
      answer([cancelled]);
      await settle();
      expect(success).toHaveBeenCalledWith('Proposal withdrawn');
      expect(changed).toHaveBeenCalledWith(cancelled);
      expect(rowOf('Jelena Jovic').querySelector('app-status-chip')?.textContent?.trim()).toBe(
        'Cancelled',
      );
      expect(rowOf('Jelena Jovic').querySelectorAll('button')).toHaveLength(0);
    });

    it('asks before cancelling an approved allocation, then cancels it', async () => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);

      action(rowOf('Marko Markovic'), 'Cancel Marko Markovic')!.click();
      await settle();

      expect(confirm).toHaveBeenCalledWith({
        title: 'Cancel allocation?',
        message: 'Marko Markovic will be removed from Project Alpha.',
        confirmText: 'Cancel allocation',
        cancelText: 'Keep',
        destructive: true,
      });
      const cancelled = allocation(1, 'Marko Markovic', 'CANCELLED', { startDate: LATER });
      httpMock.expectOne({ method: 'POST', url: '/api/allocations/1/cancel' }).flush(cancelled);
      await settle();
      answer([cancelled]);
      await settle();
      expect(success).toHaveBeenCalledWith('Allocation cancelled');
      expect(changed).toHaveBeenCalledWith(cancelled);
    });

    it('keeps the allocation when the PM does not confirm', async () => {
      await open([allocation(2, 'Jelena Jovic')]);
      confirm.mockReturnValue(of(false));

      action(rowOf('Jelena Jovic'), 'Withdraw Jelena Jovic')!.click();
      await settle();

      httpMock.expectNone({ method: 'POST', url: '/api/allocations/2/cancel' });
      expect(success).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });

    it('reloads the team after a failed cancel, and leaves the message to the error snackbar', async () => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);

      action(rowOf('Marko Markovic'), 'Cancel Marko Markovic')!.click();
      await settle();
      httpMock
        .expectOne({ method: 'POST', url: '/api/allocations/1/cancel' })
        .flush(
          { code: 'ALLOCATION_ALREADY_STARTED', message: 'Allocation has already started' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      // the allocation may have changed since it was loaded
      answer([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);
      await settle();
      expect(success).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });
  });

  describe('withdraw and cancel, for everyone else', () => {
    it.each<[string, number, Role]>([
      ['another PM', 8, 'PM'],
      ['an RM', 3, 'RM'],
      ['an Employee', 101, 'EMPLOYEE'],
      ['an Admin', 1, 'ADMIN'],
    ])('shows %s no actions', async (_who, userId, role) => {
      await open(
        [
          allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER }),
          allocation(2, 'Jelena Jovic'),
        ],
        { userId, role },
      );

      expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
      expect(rowOf('Jelena Jovic').querySelectorAll('button')).toHaveLength(0);
    });
  });
});

describe('isWithdrawable', () => {
  it.each<[AllocationStatus, boolean]>([
    ['PROPOSED', true],
    ['APPROVED', false],
    ['CHANGE_PENDING', false],
    ['REJECTED', false],
    ['CANCELLED', false],
  ])('is %s → %s', (status, expected) => {
    expect(isWithdrawable({ status })).toBe(expected);
  });
});

describe('isCancellable', () => {
  it('is true for an approved allocation starting after today', () => {
    expect(isCancellable({ status: 'APPROVED', startDate: '2026-10-24' }, '2026-10-23')).toBe(true);
  });

  it('is false on its start date, because it has started then', () => {
    expect(isCancellable({ status: 'APPROVED', startDate: '2026-10-23' }, '2026-10-23')).toBe(
      false,
    );
  });

  it('is false once it has started', () => {
    expect(isCancellable({ status: 'APPROVED', startDate: '2026-10-22' }, '2026-10-23')).toBe(
      false,
    );
  });

  it.each<AllocationStatus>(['PROPOSED', 'CHANGE_PENDING', 'REJECTED', 'CANCELLED'])(
    'is false for a %s allocation, even one that has not started',
    (status) => {
      expect(isCancellable({ status, startDate: '2026-10-24' }, '2026-10-23')).toBe(false);
    },
  );

  it('compares with today by default', () => {
    expect(isCancellable({ status: 'APPROVED', startDate: LATER })).toBe(true);
    expect(isCancellable({ status: 'APPROVED', startDate: TODAY })).toBe(false);
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
