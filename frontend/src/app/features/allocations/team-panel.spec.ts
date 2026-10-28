import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { toIsoDate } from '../../shared/dates';
import { SsDialog, SsDialogRef } from '../../shared/ui';
import { Project } from '../projects/project.models';
import { StaffingRequest } from '../requests/request.models';
import {
  Allocation,
  AllocationChange,
  AllocationStatus,
  formatPendingChange,
  hasPendingChange,
  hasStarted,
  isCancellable,
  isChangeable,
  isWithdrawable,
} from './allocation.models';
import { ChangeRequestDialog } from './change-request-dialog';
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
    return [...el().querySelectorAll<HTMLElement>('tr.cdk-row')].find((row) =>
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
      expect(action(jelena, 'Withdraw Jelena Jovic from Java Developer')?.textContent?.trim()).toBe(
        'Withdraw',
      );
      expect(action(jelena, 'Cancel Jelena Jovic on Java Developer')).toBeNull();
    });

    it('offers Cancel on an approved allocation that has not started', async () => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);

      const marko = rowOf('Marko Markovic');
      expect(action(marko, 'Cancel Marko Markovic on Java Developer')?.textContent?.trim()).toBe(
        'Cancel',
      );
      expect(action(marko, 'Withdraw Marko Markovic from Java Developer')).toBeNull();
    });

    it('names the request in the action, as one employee can be on two requests (BR-8)', async () => {
      await open([
        allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER, endDate: LATER }),
        allocation(2, 'Marko Markovic', 'APPROVED', {
          startDate: LATER,
          endDate: LATER,
          requestTitle: 'Tech Lead',
        }),
      ]);

      const labels = [...el().querySelectorAll('tr.cdk-row button')].map((button) =>
        button.getAttribute('aria-label'),
      );
      expect(labels).toEqual([
        'Request a change for Marko Markovic on Java Developer',
        'Cancel Marko Markovic on Java Developer',
        'Request a change for Marko Markovic on Tech Lead',
        'Cancel Marko Markovic on Tech Lead',
      ]);
    });

    it.each([
      ['today', TODAY],
      ['earlier', EARLIER],
    ])('offers no Cancel on an approved allocation that started %s', async (_when, startDate) => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate, endDate: LATER })]);

      const marko = rowOf('Marko Markovic');
      expect(action(marko, 'Cancel Marko Markovic on Java Developer')).toBeNull();
      // It can still be changed (US-13)
      expect(
        [...marko.querySelectorAll('button')].map((button) => button.textContent?.trim()),
      ).toEqual(['Request change']);
    });

    it.each<AllocationStatus>(['REJECTED', 'CANCELLED'])(
      'offers no action on a %s allocation',
      async (status) => {
        await open([allocation(1, 'Marko Markovic', status, { startDate: LATER })]);

        expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
      },
    );

    it('asks before withdrawing, then withdraws, reloads the team and tells the page', async () => {
      await open([allocation(2, 'Jelena Jovic')]);

      action(rowOf('Jelena Jovic'), 'Withdraw Jelena Jovic from Java Developer')!.click();
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

      action(rowOf('Marko Markovic'), 'Cancel Marko Markovic on Java Developer')!.click();
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

      action(rowOf('Jelena Jovic'), 'Withdraw Jelena Jovic from Java Developer')!.click();
      await settle();

      httpMock.expectNone({ method: 'POST', url: '/api/allocations/2/cancel' });
      expect(success).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });

    it('reloads the team after a failed cancel, and leaves the message to the error snackbar', async () => {
      await open([allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER })]);

      action(rowOf('Marko Markovic'), 'Cancel Marko Markovic on Java Developer')!.click();
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

  describe('request and withdraw a change (US-13), for the PM who owns the project', () => {
    const REQUEST: StaffingRequest = {
      id: 1,
      projectId: 5,
      title: 'Java Developer',
      seniority: 'MEDIOR',
      allocationPercent: 60,
      startDate: '2026-11-01',
      endDate: '2027-01-31',
      headcount: 2,
      status: 'FILLED',
      createdAt: '2026-10-21T09:15:30Z',
      skills: [],
    };

    let openDialog: ReturnType<typeof vi.spyOn>;

    /** The dialog is tested on its own, so here it only closes with this result. */
    function dialogClosesWith(result: AllocationChange | undefined): void {
      openDialog = vi
        .spyOn(TestBed.inject(SsDialog), 'open')
        .mockReturnValue({ afterClosed: () => of(result) } as SsDialogRef<unknown>);
    }

    function changeOf(warnings: string[] = []): AllocationChange {
      return {
        allocation: allocation(1, 'Marko Markovic', 'CHANGE_PENDING', {
          endDate: LATER,
          pendingPercent: 80,
          pendingStartDate: '2026-11-01',
          pendingEndDate: LATER,
          changeReason: 'The client asked for more work',
        }),
        warnings,
      };
    }

    const MARKO_APPROVED = (): Allocation =>
      allocation(1, 'Marko Markovic', 'APPROVED', { endDate: LATER });

    async function requestChange(): Promise<void> {
      action(
        rowOf('Marko Markovic'),
        'Request a change for Marko Markovic on Java Developer',
      )!.click();
      await settle();
      httpMock.expectOne({ method: 'GET', url: '/api/requests/1' }).flush(REQUEST);
      await settle();
    }

    it('offers Request change on an approved allocation, even one that has started', async () => {
      await open([
        allocation(1, 'Marko Markovic', 'APPROVED', { startDate: EARLIER, endDate: LATER }),
      ]);

      expect(
        action(
          rowOf('Marko Markovic'),
          'Request a change for Marko Markovic on Java Developer',
        )?.textContent?.trim(),
      ).toBe('Request change');
    });

    it('offers no Request change on an approved allocation that has ended', async () => {
      await open([
        allocation(1, 'Marko Markovic', 'APPROVED', { startDate: EARLIER, endDate: EARLIER }),
      ]);

      expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
    });

    it('offers only Withdraw change on a change that waits for the RM', async () => {
      // Not Cancel either, even before the start: the change is withdrawn first (US-12)
      await open([
        allocation(1, 'Marko Markovic', 'CHANGE_PENDING', { startDate: LATER, pendingPercent: 80 }),
      ]);

      const buttons = [...rowOf('Marko Markovic').querySelectorAll('button')];
      expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Withdraw the change for Marko Markovic on Java Developer',
      ]);
      expect(buttons[0].textContent?.trim()).toBe('Withdraw change');
    });

    it('opens the dialog with the allocation and its request, then reloads and says so', async () => {
      await open([MARKO_APPROVED()]);
      const change = changeOf();
      dialogClosesWith(change);

      await requestChange();

      expect(openDialog).toHaveBeenCalledWith(ChangeRequestDialog, {
        data: { allocation: MARKO_APPROVED(), request: REQUEST },
        width: '520px',
      });
      answer([change.allocation]);
      await settle();
      expect(success).toHaveBeenCalledWith('Change requested');
      expect(rowOf('Marko Markovic').textContent).toContain('60% → 80% pending');
      // The request's status doesn't change (BR-16), so the page needn't load it again
      expect(changed).not.toHaveBeenCalled();
      expect(el().querySelector('.team-panel__notice')).toBeNull();
    });

    it('keeps the warnings of a change request on the panel until they are dismissed (BR-2)', async () => {
      await open([MARKO_APPROVED()]);
      dialogClosesWith(changeOf(['Capacity would be exceeded on 2026-11-02 – 2026-11-13 (110%)']));

      await requestChange();
      answer([changeOf().allocation]);
      await settle();

      const notice = el().querySelector<HTMLElement>('[role="status"] .team-panel__notice')!;
      expect(notice.textContent).toContain(
        'A change for Marko Markovic was requested, with warnings',
      );
      expect(notice.textContent).toContain(
        'Capacity would be exceeded on 2026-11-02 – 2026-11-13 (110%)',
      );
      expect(success).not.toHaveBeenCalled();

      notice
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Dismiss the warnings for Marko Markovic"]',
        )!
        .click();
      await settle();
      expect(el().querySelector('.team-panel__notice')).toBeNull();
    });

    it('changes nothing when the PM closes the dialog without requesting', async () => {
      await open([MARKO_APPROVED()]);
      dialogClosesWith(undefined);

      await requestChange();

      httpMock.expectNone(LIST_URL);
      expect(success).not.toHaveBeenCalled();
    });

    it('asks before withdrawing a change, then withdraws it and reloads the team', async () => {
      await open([allocation(1, 'Marko Markovic', 'CHANGE_PENDING', { pendingPercent: 80 })]);

      action(
        rowOf('Marko Markovic'),
        'Withdraw the change for Marko Markovic on Java Developer',
      )!.click();
      await settle();

      expect(confirm).toHaveBeenCalledWith({
        title: 'Withdraw change?',
        message:
          'The change waiting for approval is dropped, and Marko Markovic stays at 60% on Java Developer for 1 Nov 2026 – 31 Jan 2027.',
        confirmText: 'Withdraw change',
        cancelText: 'Keep',
        destructive: true,
      });
      const approved = allocation(1, 'Marko Markovic', 'APPROVED');
      httpMock
        .expectOne({ method: 'DELETE', url: '/api/allocations/1/change-request' })
        .flush(approved);
      await settle();
      answer([approved]);
      await settle();
      expect(success).toHaveBeenCalledWith('Change withdrawn');
      expect(rowOf('Marko Markovic').querySelector('app-status-chip')?.textContent?.trim()).toBe(
        'Approved',
      );
    });

    it('keeps the change when the PM does not confirm', async () => {
      await open([allocation(1, 'Marko Markovic', 'CHANGE_PENDING', { pendingPercent: 80 })]);
      confirm.mockReturnValue(of(false));

      action(
        rowOf('Marko Markovic'),
        'Withdraw the change for Marko Markovic on Java Developer',
      )!.click();
      await settle();

      httpMock.expectNone({ method: 'DELETE', url: '/api/allocations/1/change-request' });
      expect(success).not.toHaveBeenCalled();
    });

    it('reloads the team after a failed withdrawal, and leaves the message to the error snackbar', async () => {
      await open([allocation(1, 'Marko Markovic', 'CHANGE_PENDING', { pendingPercent: 80 })]);

      action(
        rowOf('Marko Markovic'),
        'Withdraw the change for Marko Markovic on Java Developer',
      )!.click();
      await settle();
      httpMock
        .expectOne({ method: 'DELETE', url: '/api/allocations/1/change-request' })
        .flush(
          { code: 'NO_PENDING_CHANGE', message: 'There is no pending change to withdraw' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      // the RM may have decided in the meantime
      answer([allocation(1, 'Marko Markovic', 'APPROVED')]);
      await settle();
      expect(success).not.toHaveBeenCalled();
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

    it.each<Project['status']>(['COMPLETED', 'CANCELLED'])(
      'shows the PM who owns a %s project no actions',
      async (status) => {
        await open(
          [
            allocation(1, 'Marko Markovic', 'APPROVED', { startDate: LATER }),
            allocation(2, 'Jelena Jovic'),
          ],
          { project: { ...PROJECT, status } },
        );

        expect(rowOf('Marko Markovic').querySelectorAll('button')).toHaveLength(0);
        expect(rowOf('Jelena Jovic').querySelectorAll('button')).toHaveLength(0);
      },
    );
  });
});

describe('hasStarted', () => {
  it('is true on the start date and after it, as on the server', () => {
    expect(hasStarted({ startDate: '2026-10-23' }, '2026-10-23')).toBe(true);
    expect(hasStarted({ startDate: '2026-10-22' }, '2026-10-23')).toBe(true);
  });

  it('is false before the start date', () => {
    expect(hasStarted({ startDate: '2026-10-24' }, '2026-10-23')).toBe(false);
  });
});

describe('isChangeable', () => {
  it('is true for an approved allocation up to and on its end date', () => {
    expect(isChangeable({ status: 'APPROVED', endDate: '2026-10-24' }, '2026-10-23')).toBe(true);
    expect(isChangeable({ status: 'APPROVED', endDate: '2026-10-23' }, '2026-10-23')).toBe(true);
  });

  it('is false once it has ended (T-33)', () => {
    expect(isChangeable({ status: 'APPROVED', endDate: '2026-10-22' }, '2026-10-23')).toBe(false);
  });

  it.each<AllocationStatus>(['PROPOSED', 'CHANGE_PENDING', 'REJECTED', 'CANCELLED'])(
    'is false for a %s allocation (T-31, T-33)',
    (status) => {
      expect(isChangeable({ status, endDate: '2026-10-24' }, '2026-10-23')).toBe(false);
    },
  );
});

describe('hasPendingChange', () => {
  it.each<[AllocationStatus, boolean]>([
    ['CHANGE_PENDING', true],
    ['APPROVED', false],
    ['PROPOSED', false],
  ])('is %s → %s', (status, expected) => {
    expect(hasPendingChange({ status })).toBe(expected);
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
