import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Allocation, PendingApproval } from './allocation.models';
import { PendingApprovalsPage } from './pending-approvals-page';
import { RejectDialog } from './reject-dialog';

const LIST_URL = '/api/allocations/pending?page=0&size=20';

function allocation(
  id: number,
  employeeName: string,
  values: Partial<Allocation> = {},
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
    status: 'PROPOSED',
    createdAt: '2026-10-22T09:15:30Z',
    pendingPercent: null,
    pendingStartDate: null,
    pendingEndDate: null,
    changeReason: null,
    ...values,
  };
}

// §4 step 6: Jelena, proposed at 60% for the whole period
const JELENA: PendingApproval = {
  type: 'NEW',
  allocation: allocation(2, 'Jelena Jovic'),
  proposedById: 7,
  proposedByName: 'Ana PM',
};

// §4 step 8: Marko, approved at 60%, with a change to 80% waiting
const MARKO_CHANGE: PendingApproval = {
  type: 'CHANGE',
  allocation: allocation(1, 'Marko Markovic', {
    status: 'CHANGE_PENDING',
    pendingPercent: 80,
    pendingStartDate: '2026-11-01',
    pendingEndDate: '2027-01-31',
    changeReason: 'The client asked for more work',
  }),
  proposedById: 7,
  proposedByName: 'Ana PM',
};

/** One `{ date, load }` per working day, as the API sends them. */
function days(
  from: number,
  to: number,
  load: number,
  month = '2026-11',
): { date: string; load: number }[] {
  const result: { date: string; load: number }[] = [];
  for (let day = from; day <= to; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    if (weekday !== 0 && weekday !== 6) {
      result.push({ date, load });
    }
  }
  return result;
}

describe('PendingApprovalsPage', () => {
  let fixture: ComponentFixture<PendingApprovalsPage>;
  let httpMock: HttpTestingController;
  let confirm: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  async function open(items: PendingApproval[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PendingApprovalsPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    confirm = vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockReturnValue(of(true));
    const notifications = TestBed.inject(Notifications);
    success = vi.spyOn(notifications, 'success').mockReturnValue(undefined);
    error = vi.spyOn(notifications, 'error').mockReturnValue(undefined);
    fixture = TestBed.createComponent(PendingApprovalsPage);
    await settle();
    answer(items);
    await settle();
  }

  function answer(items: PendingApproval[]): void {
    httpMock.expectOne({ method: 'GET', url: LIST_URL }).flush({
      content: items,
      page: { size: 20, number: 0, totalElements: items.length, totalPages: 1 },
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

  function button(label: string): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  function capacityError(details: unknown[]): void {
    httpMock.expectOne({ method: 'POST', url: '/api/allocations/2/approve' }).flush(
      {
        timestamp: '2026-11-03T10:15:30Z',
        status: 409,
        code: 'CAPACITY_EXCEEDED',
        message:
          'Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)',
        details,
      },
      { status: 409, statusText: 'Conflict' },
    );
  }

  it('lists new proposals and changes with a chip, the employee, project, request and values', async () => {
    await open([MARKO_CHANGE, JELENA]);

    const headers = [...el().querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Type',
      'Employee',
      'Project',
      'Request',
      'Allocation and period',
      '',
    ]);

    const jelena = rowOf('Jelena Jovic');
    expect(jelena.querySelector('app-status-chip')?.textContent?.trim()).toBe('New');
    expect(jelena.textContent).toContain('Project Alpha');
    expect(jelena.textContent).toContain('Java Developer');
    expect(jelena.textContent).toContain('60%');
    expect(jelena.textContent).toContain('1 Nov 2026 – 31 Jan 2027');
    expect(jelena.querySelector('.change-diff__new')).toBeNull();
  });

  it('shows a change as old → new with change-diff, and its reason', async () => {
    await open([MARKO_CHANGE]);

    const marko = rowOf('Marko Markovic');
    expect(marko.querySelector('app-status-chip')?.textContent?.trim()).toBe('Change');
    expect(marko.querySelector('app-change-diff .change-diff__old')?.textContent).toBe('60%');
    expect(marko.querySelector('app-change-diff .change-diff__new')?.textContent).toBe('80%');
    expect(marko.textContent).toContain('Reason: The client asked for more work');
  });

  it('says so when nothing is waiting', async () => {
    await open([]);

    expect(el().textContent).toContain('Nothing is waiting for you');
  });

  it('asks before approving a proposal, approves it and loads the list again', async () => {
    await open([JELENA]);

    button('Approve Jelena Jovic on Java Developer').click();
    await settle();

    expect(confirm).toHaveBeenCalledWith({
      title: 'Approve allocation?',
      message:
        'Jelena Jovic will be allocated 60% to Java Developer (Project Alpha) for 1 Nov 2026 – 31 Jan 2027.',
      confirmText: 'Approve',
    });
    httpMock
      .expectOne({ method: 'POST', url: '/api/allocations/2/approve' })
      .flush({ ...JELENA.allocation, status: 'APPROVED' });
    await settle();
    answer([]);
    await settle();
    expect(success).toHaveBeenCalledWith('Allocation approved');
    expect(el().textContent).toContain('Nothing is waiting for you');
  });

  it('asks before approving a change with the old and new values', async () => {
    await open([MARKO_CHANGE]);

    button('Approve the change for Marko Markovic on Java Developer').click();
    await settle();

    expect(confirm).toHaveBeenCalledWith({
      title: 'Approve change?',
      message:
        'Marko Markovic will be at 80% on Java Developer (Project Alpha) for 1 Nov 2026 – 31 Jan 2027, instead of 60% for 1 Nov 2026 – 31 Jan 2027.',
      confirmText: 'Approve change',
    });
    httpMock
      .expectOne({ method: 'POST', url: '/api/allocations/1/approve' })
      .flush({ ...MARKO_CHANGE.allocation, status: 'APPROVED', percent: 80 });
    await settle();
    answer([]);
    await settle();
    expect(success).toHaveBeenCalledWith('Change approved');
  });

  it('does nothing when the RM does not confirm', async () => {
    await open([JELENA]);
    confirm.mockReturnValue(of(false));

    button('Approve Jelena Jovic on Java Developer').click();
    await settle();

    httpMock.expectNone('/api/allocations/2/approve');
  });

  describe('when approving would go over capacity (409 CAPACITY_EXCEEDED, §4 step 6)', () => {
    it('lists the overloaded days readably above the list instead of in the snackbar', async () => {
      await open([JELENA]);

      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      capacityError(days(2, 13, 120));
      await settle();
      answer([JELENA]);
      await settle();

      const notice = el().querySelector<HTMLElement>('.approvals__capacity')!;
      expect(notice.closest('[role="alert"]')).not.toBeNull();
      expect(notice.textContent).toContain(
        'Not approved: Jelena Jovic would be over capacity on 10 working days',
      );
      const lines = [...notice.querySelectorAll('li')].map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(lines).toEqual(['2 Nov 2026 – 13 Nov 2026 60% existing + 60% new = 120%']);
      expect(notice.textContent).toContain('the proposal is still waiting for you');
      // Readable, not the raw details
      expect(notice.textContent).not.toContain('"load"');
      expect(notice.textContent).not.toContain('2026-11-02');
      expect(error).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      // Still in the list: nothing changed on the server
      expect(rowOf('Jelena Jovic')).toBeDefined();
    });

    it('splits the days into runs where the load changes or a working day is missing', async () => {
      await open([JELENA]);

      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      // A different load starts a new run, and so does a working day that isn't overloaded (11 Nov)
      capacityError([...days(2, 6, 120), ...days(9, 10, 150), { date: '2026-11-12', load: 150 }]);
      await settle();
      answer([JELENA]);
      await settle();

      const lines = [...el().querySelectorAll('.approvals__capacity li')].map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(lines).toEqual([
        '2 Nov 2026 – 6 Nov 2026 60% existing + 60% new = 120%',
        '9 Nov 2026 – 10 Nov 2026 90% existing + 60% new = 150%',
        '12 Nov 2026 90% existing + 60% new = 150%',
      ]);
      expect(el().querySelector('.approvals__capacity')?.textContent).toContain(
        'on 8 working days',
      );
    });

    it('counts only the days it lists, without entries that are not a day and a load', async () => {
      await open([JELENA]);

      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      capacityError([...days(2, 3, 120), { date: '2026-11-04' }, 'not a day']);
      await settle();
      answer([JELENA]);
      await settle();

      const notice = el().querySelector('.approvals__capacity');
      expect(notice?.textContent).toContain('on 2 working days');
      expect(notice?.querySelectorAll('li')).toHaveLength(1);
    });

    it('counts a change with its new percent, and says the current values stay', async () => {
      const change: PendingApproval = {
        ...MARKO_CHANGE,
        allocation: { ...MARKO_CHANGE.allocation, id: 2 },
      };
      await open([change]);

      button('Approve the change for Marko Markovic on Java Developer').click();
      await settle();
      capacityError([{ date: '2026-11-02', load: 110 }]);
      await settle();
      answer([change]);
      await settle();

      const notice = el().querySelector<HTMLElement>('.approvals__capacity')!;
      expect(notice.textContent).toContain('over capacity on 1 working day');
      expect(notice.querySelector('li')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        '2 Nov 2026 30% existing + 80% new = 110%',
      );
      expect(notice.textContent).toContain(
        'the change is still waiting for you, and 60% stays in force',
      );
    });

    it('can be dismissed', async () => {
      await open([JELENA]);

      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      capacityError(days(2, 13, 120));
      await settle();
      answer([JELENA]);
      await settle();

      button('Dismiss the capacity error').click();
      await settle();

      expect(el().querySelector('.approvals__capacity')).toBeNull();
    });

    it('goes away once a later approval goes through', async () => {
      await open([JELENA]);
      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      capacityError(days(2, 13, 120));
      await settle();
      answer([JELENA]);
      await settle();

      // e.g. the PM has moved the period in the meantime (§4 step 7)
      button('Approve Jelena Jovic on Java Developer').click();
      await settle();
      httpMock
        .expectOne({ method: 'POST', url: '/api/allocations/2/approve' })
        .flush({ ...JELENA.allocation, status: 'APPROVED' });
      await settle();
      answer([]);
      await settle();

      expect(el().querySelector('.approvals__capacity')).toBeNull();
    });
  });

  it('shows any other approval error in the snackbar and loads the list again', async () => {
    await open([JELENA]);

    button('Approve Jelena Jovic on Java Developer').click();
    await settle();
    httpMock.expectOne({ method: 'POST', url: '/api/allocations/2/approve' }).flush(
      {
        timestamp: '2026-11-03T10:15:30Z',
        status: 409,
        code: 'INVALID_ALLOCATION_STATUS',
        message:
          'Only a proposed allocation or a pending change can be approved or rejected, but this one is cancelled',
        details: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    answer([]);
    await settle();

    // Once, by the page: approve skips the global snackbar so it isn't shown twice
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Only a proposed allocation or a pending change can be approved or rejected, but this one is cancelled',
    );
    expect(el().querySelector('.approvals__capacity')).toBeNull();
  });

  it('opens the reject dialog, then loads the list again once rejected', async () => {
    await open([MARKO_CHANGE]);
    const dialogOpen = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of({ ...MARKO_CHANGE.allocation, status: 'APPROVED' }),
    } as MatDialogRef<unknown>);

    button('Reject the change for Marko Markovic on Java Developer').click();
    await settle();
    answer([]);
    await settle();

    expect(dialogOpen).toHaveBeenCalledWith(RejectDialog, { data: MARKO_CHANGE, width: '520px' });
    expect(success).toHaveBeenCalledWith('Change rejected');
  });

  it('leaves the list as it is when the reject dialog is cancelled', async () => {
    await open([JELENA]);
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(undefined),
    } as MatDialogRef<unknown>);

    button('Reject Jelena Jovic on Java Developer').click();
    await settle();

    httpMock.expectNone(LIST_URL);
    expect(success).not.toHaveBeenCalled();
  });
});
