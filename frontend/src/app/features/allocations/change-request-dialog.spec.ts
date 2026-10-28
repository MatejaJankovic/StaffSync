import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { parseIsoDate, shortDate, toIsoDate } from '../../shared/dates';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { StaffingRequest } from '../requests/request.models';
import { Allocation, AllocationChange } from './allocation.models';
import { ChangeRequestDialog, ChangeRequestDialogData } from './change-request-dialog';

// Relative to when the tests run, because whether an allocation has started depends on today
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

/** How the date picker shows a day: `05/11/2026`. */
function typed(iso: string): string {
  const [year, month, dayOfMonth] = iso.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

const REQUEST: StaffingRequest = {
  id: 9,
  projectId: 5,
  title: 'Java Developer',
  seniority: 'MEDIOR',
  allocationPercent: 60,
  startDate: day(-30),
  endDate: day(120),
  headcount: 2,
  status: 'FILLED',
  createdAt: '2026-10-21T09:15:30Z',
  skills: [],
};

// §4 step 8: Marko, approved at 60%, before it starts
const MARKO: Allocation = {
  id: 31,
  employeeId: 4,
  employeeName: 'Marko Markovic',
  projectId: 5,
  projectName: 'Project Alpha',
  requestId: 9,
  requestTitle: 'Java Developer',
  percent: 60,
  startDate: day(10),
  endDate: day(60),
  status: 'APPROVED',
  createdAt: '2026-10-22T09:15:30Z',
  pendingPercent: null,
  pendingStartDate: null,
  pendingEndDate: null,
  changeReason: null,
};

const STARTED: Allocation = { ...MARKO, startDate: day(-10) };

const REASON = 'The client asked for more work on the reporting module';

const CHANGE_URL = '/api/allocations/31/change-request';

const CHANGE: AllocationChange = {
  allocation: {
    ...MARKO,
    status: 'CHANGE_PENDING',
    pendingPercent: 80,
    pendingStartDate: MARKO.startDate,
    pendingEndDate: MARKO.endDate,
    changeReason: REASON,
  },
  warnings: [],
};

describe('ChangeRequestDialog', () => {
  let fixture: ComponentFixture<ChangeRequestDialog>;
  let httpMock: HttpTestingController;
  let notifications: Notifications;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  async function open(allocation: Allocation = MARKO): Promise<void> {
    close.mockReset();
    dialogRef.disableClose = false;
    const data: ChangeRequestDialogData = { allocation, request: REQUEST };
    await TestBed.configureTestingModule({
      imports: [ChangeRequestDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: SS_DIALOG_DATA, useValue: data },
        { provide: SsDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(ChangeRequestDialog);
    await settle();
  }

  afterEach(() => httpMock.verify());

  /** The inputs and the error messages each take a round of change detection to settle. */
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

  function form() {
    return fixture.componentInstance['form'];
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  function submitButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  function cancelButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[ss-dialog-close]')!;
  }

  function dateInputs(): HTMLInputElement[] {
    return [...el().querySelectorAll<HTMLInputElement>('app-date-range-picker input')];
  }

  async function percent(value: number): Promise<void> {
    form().controls.percent.setValue(value);
    await settle();
  }

  async function period(start: string, end: string): Promise<void> {
    form().controls.period.setValue({ start: parseIsoDate(start), end: parseIsoDate(end) });
    await settle();
  }

  async function reason(text: string): Promise<void> {
    const textarea = el().querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));
    await settle();
  }

  /** The preview as it reads, row by row, without the text that is only for screen readers. */
  function preview(): string {
    const node = el().querySelector('app-change-diff')!.cloneNode(true) as HTMLElement;
    node.querySelectorAll('.change-diff__hidden').forEach((hidden) => hidden.remove());
    return [...node.querySelectorAll('.change-diff__row')]
      .map(
        (row) => `${row.querySelector('dt')!.textContent} ${row.querySelector('dd')!.textContent}`,
      )
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('says whose allocation changes, on which request and project', async () => {
    await open();

    expect(el().querySelector('h2')?.textContent).toContain('Request change for Marko Markovic');
    expect(el().textContent).toContain('Java Developer · Project Alpha');
  });

  it('starts with the current values and an empty reason, and nothing changes yet', async () => {
    await open();

    expect(form().getRawValue()).toEqual({
      percent: 60,
      period: { start: parseIsoDate(MARKO.startDate), end: parseIsoDate(MARKO.endDate) },
      reason: '',
    });
    expect(dateInputs().map((input) => input.value)).toEqual([
      typed(MARKO.startDate),
      typed(MARKO.endDate),
    ]);
    expect(preview()).toBe(
      `Allocation 60% Period ${shortDate(MARKO.startDate)} – ${shortDate(MARKO.endDate)}`,
    );
    expect(el().textContent).toContain(
      'Pick a different allocation or period to request a change.',
    );
  });

  it('shows old → new as the PM changes the values', async () => {
    await open();

    await percent(80);
    expect(preview()).toContain('Allocation 60% → 80%');

    await period(MARKO.startDate, day(90));
    expect(preview()).toContain(
      `${shortDate(MARKO.startDate)} – ${shortDate(MARKO.endDate)} → ${shortDate(MARKO.startDate)} – ${shortDate(day(90))}`,
    );
    expect(el().textContent).not.toContain('Pick a different allocation or period');
  });

  describe('requesting', () => {
    it('requests 60% → 80% with the reason, as in §4 step 8, and closes with the change', async () => {
      await open();

      await percent(80);
      await reason(`  ${REASON} `);
      await submit();

      const req = httpMock.expectOne({ method: 'POST', url: CHANGE_URL });
      expect(req.request.body).toEqual({
        percent: 80,
        startDate: MARKO.startDate,
        endDate: MARKO.endDate,
        reason: REASON,
      });
      req.flush(CHANGE);
      expect(close).toHaveBeenCalledWith(CHANGE);
    });

    it('lets the PM move both dates of an allocation that has not started', async () => {
      await open();

      await period(day(20), day(90));
      await reason(REASON);
      await submit();

      expect(httpMock.expectOne(CHANGE_URL).request.body).toMatchObject({
        percent: 60,
        startDate: day(20),
        endDate: day(90),
      });
    });

    it('lets the PM extend the end of an allocation that has started', async () => {
      await open(STARTED);

      expect(el().textContent).toContain(
        `Started on ${shortDate(STARTED.startDate)}, so only the end date can change.`,
      );
      await period(STARTED.startDate, day(90));
      await reason(REASON);
      await submit();

      expect(httpMock.expectOne(CHANGE_URL).request.body).toMatchObject({
        startDate: STARTED.startDate,
        endDate: day(90),
      });
    });
  });

  describe('a change the API would refuse', () => {
    it('does not send a change that changes nothing', async () => {
      await open();

      await reason(REASON);
      await submit();

      httpMock.expectNone(CHANGE_URL);
      const message = el().querySelector('.change-request-dialog__preview [role="alert"]');
      expect(message?.textContent).toContain('Pick a different allocation or period');
    });

    it('does not move the start of an allocation that has started (T-32)', async () => {
      await open(STARTED);

      await period(day(-5), STARTED.endDate);
      await reason(REASON);
      await submit();

      httpMock.expectNone(CHANGE_URL);
      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        `The allocation started on ${shortDate(STARTED.startDate)}, so its start date can’t change.`,
      );
    });

    it('does not accept a start before the current one on an allocation that has started', async () => {
      await open(STARTED);

      await period(day(-20), STARTED.endDate);
      await reason(REASON);
      await submit();

      httpMock.expectNone(CHANGE_URL);
      expect(el().textContent).toContain('Dates must be between');
    });

    it('does not accept an end after the request ends (BR-3)', async () => {
      await open();

      await period(MARKO.startDate, day(121));
      await reason(REASON);
      await submit();

      httpMock.expectNone(CHANGE_URL);
      expect(el().textContent).toContain(
        `Dates must be between ${typed(REQUEST.startDate)} and ${typed(REQUEST.endDate)}`,
      );
    });

    it.each([
      ['empty', '', 'Reason is required'],
      ['only spaces', '      ', 'Reason is required'],
      ['short without the spaces', '  Too short ', 'Reason must be at least 10 characters'],
      ['too long', 'x'.repeat(1001), 'Reason must be at most 1000 characters'],
    ])('does not accept a reason that is %s', async (_what, text, message) => {
      await open();

      await percent(80);
      await reason(text);
      await submit();

      httpMock.expectNone(CHANGE_URL);
      expect(el().querySelector('ss-error')?.textContent?.trim()).toBe(message);
    });
  });

  describe('when the API answers with an error', () => {
    it.each<[number, string, string]>([
      [
        400,
        'ALLOCATION_OUTSIDE_REQUEST',
        'The allocation period must be inside the request period',
      ],
      [
        403,
        'NOT_PROJECT_OWNER',
        'Only the project manager who owns this project can request changes',
      ],
      [409, 'CHANGE_ALREADY_PENDING', 'A change to this allocation is already waiting'],
      [409, 'ALLOCATION_ENDED', 'Allocation ended on 2026-10-01, so it can’t be changed'],
    ])('shows the %i %s message in the snackbar and stays open', async (status, code, message) => {
      await open();
      await percent(80);
      await reason(REASON);
      await submit();

      httpMock.expectOne(CHANGE_URL).flush({ code, message }, { status, statusText: 'Error' });
      await settle();

      expect(notifications.error).toHaveBeenCalledWith(message);
      expect(close).not.toHaveBeenCalled();
      expect(submitButton().disabled).toBe(false);
    });
  });

  describe('while the change request is on its way', () => {
    it('ignores a second submit', async () => {
      await open();
      await percent(80);
      await reason(REASON);

      await submit();
      await submit();

      httpMock.expectOne({ method: 'POST', url: CHANGE_URL });
    });

    it('cannot be dismissed, only after it fails', async () => {
      await open();
      await percent(80);
      await reason(REASON);

      await submit();

      expect(dialogRef.disableClose).toBe(true);
      expect(cancelButton().disabled).toBe(true);
      expect(submitButton().disabled).toBe(true);

      httpMock
        .expectOne(CHANGE_URL)
        .flush(
          { code: 'CHANGE_ALREADY_PENDING', message: 'Already pending' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(dialogRef.disableClose).toBe(false);
      expect(cancelButton().disabled).toBe(false);
      expect(submitButton().disabled).toBe(false);
    });
  });

  it('closes without a change when the PM cancels', async () => {
    await open();

    cancelButton().click();
    await settle();

    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.calls[0][0]).toBeFalsy();
    httpMock.expectNone(CHANGE_URL);
  });
});
