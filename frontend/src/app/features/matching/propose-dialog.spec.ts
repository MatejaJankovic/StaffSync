import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { AllocationProposal } from '../allocations/allocation.models';
import { ALLOCATIONS_URL } from '../allocations/allocation.service';
import { StaffingRequest } from '../requests/request.models';
import { Candidate } from './candidate.models';
import { ProposeDialog, ProposeDialogData } from './propose-dialog';

// §4 step 2: the demo request
const REQUEST: StaffingRequest = {
  id: 9,
  projectId: 5,
  title: 'Java Developer',
  seniority: 'MEDIOR',
  allocationPercent: 60,
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  headcount: 2,
  status: 'OPEN',
  createdAt: '2026-10-21T09:15:30Z',
  skills: [
    { skillId: 1, skillName: 'Java', category: 'BACKEND', minLevel: 4, mandatory: true },
    { skillId: 2, skillName: 'Spring', category: 'BACKEND', minLevel: 3, mandatory: true },
  ],
};

// §4 step 3: Jelena, 67/100, with only 40% free until 14 Nov
const JELENA: Candidate = {
  employeeId: 17,
  fullName: 'Jelena Petrović',
  seniority: 'MEDIOR',
  department: 'Engineering',
  score: 67,
  breakdown: { skills: 23, availability: 34, seniority: 10 },
  reasons: ['Java 4/5 (required ≥ 4)', 'Spring 3/5 (required ≥ 3)'],
  warnings: [
    'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)',
    'Missing PostgreSQL (nice to have)',
  ],
};

const PROPOSAL: AllocationProposal = {
  allocation: {
    id: 31,
    employeeId: 17,
    employeeName: 'Jelena Petrović',
    projectId: 5,
    projectName: 'Project Alpha',
    requestId: 9,
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
  },
  warnings: ['Capacity would be exceeded on 2026-11-02 – 2026-11-13 (120%)'],
};

describe('ProposeDialog', () => {
  let fixture: ComponentFixture<ProposeDialog>;
  let httpMock: HttpTestingController;
  let notifications: Notifications;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  async function open(data: Partial<ProposeDialogData> = {}): Promise<void> {
    close.mockReset();
    dialogRef.disableClose = false;
    await TestBed.configureTestingModule({
      imports: [ProposeDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: SS_DIALOG_DATA, useValue: { request: REQUEST, candidate: JELENA, ...data } },
        { provide: SsDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(ProposeDialog);
    await settle();
  }

  afterEach(() => httpMock.verify());

  /** The inputs and the error message each take a round of change detection to settle. */
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

  function proposeButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  function cancelButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[ss-dialog-close]')!;
  }

  function dateInputs(): HTMLInputElement[] {
    return [...el().querySelectorAll<HTMLInputElement>('app-date-range-picker input')];
  }

  /** Types a date the way a user does, day first: `15/11/2026`. */
  async function type(input: HTMLInputElement, text: string): Promise<void> {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  function period(start: Date | null, end: Date | null): void {
    form().controls.period.setValue({ start, end });
  }

  it('says who is proposed for which request, with the score', async () => {
    await open();

    expect(el().querySelector('h2')?.textContent).toContain('Propose Jelena Petrović');
    expect(el().textContent).toContain('Java Developer · score 67/100');
  });

  it('starts with the percent and the period of the request', async () => {
    await open();

    expect(form().getRawValue()).toEqual({
      percent: 60,
      period: { start: new Date(2026, 10, 1), end: new Date(2027, 0, 31) },
    });
    expect(el().querySelector('ss-select')?.textContent).toContain('60%');
    // shown day first, like everywhere else
    expect(dateInputs().map((input) => input.value)).toEqual(['01/11/2026', '31/01/2027']);
    expect(el().textContent).toContain('1 Nov 2026 – 31 Jan 2027');
  });

  it('shows the warnings of the candidate, because they decide how to shorten the period', async () => {
    await open();

    const warnings = [...el().querySelectorAll('.propose-dialog__warnings li span')].map((node) =>
      node.textContent?.trim(),
    );
    expect(warnings).toEqual(JELENA.warnings);
    expect(el().querySelectorAll('.propose-dialog__warnings ss-icon')).toHaveLength(2);
  });

  it('shows no warnings list for a candidate without warnings', async () => {
    await open({ candidate: { ...JELENA, warnings: [] } });

    expect(el().querySelector<HTMLElement>('.propose-dialog__warnings')?.hidden).toBe(true);
    expect(el().querySelectorAll('.propose-dialog__warnings li')).toHaveLength(0);
  });

  it('offers the allocations from 10% to 100% in steps of 10', async () => {
    await open();

    el().querySelector<HTMLElement>('[role="combobox"]')!.click();
    await settle();

    const options = [...document.querySelectorAll('[role="option"]')].map((option) =>
      option.textContent?.trim(),
    );
    expect(options).toEqual([
      '10%',
      '20%',
      '30%',
      '40%',
      '50%',
      '60%',
      '70%',
      '80%',
      '90%',
      '100%',
    ]);
  });

  describe('proposing', () => {
    it('proposes for the percent and period of the request, and closes with the proposal', async () => {
      await open();

      await submit();

      const req = httpMock.expectOne({ method: 'POST', url: ALLOCATIONS_URL });
      expect(req.request.body).toEqual({
        requestId: 9,
        employeeId: 17,
        percent: 60,
        startDate: '2026-11-01',
        endDate: '2027-01-31',
      });
      req.flush(PROPOSAL);
      expect(close).toHaveBeenCalledWith(PROPOSAL);
    });

    it('lets the PM shorten the period by typing the dates, as in §4 step 7', async () => {
      await open();

      await type(dateInputs()[0], '15/11/2026');
      await submit();

      const req = httpMock.expectOne({ method: 'POST', url: ALLOCATIONS_URL });
      expect(req.request.body).toMatchObject({
        startDate: '2026-11-15',
        endDate: '2027-01-31',
      });
    });

    it('lets the PM shorten the end of the period too', async () => {
      await open();

      period(new Date(2026, 10, 15), new Date(2026, 11, 31));
      await submit();

      expect(httpMock.expectOne(ALLOCATIONS_URL).request.body).toMatchObject({
        startDate: '2026-11-15',
        endDate: '2026-12-31',
      });
    });

    it('lets the PM pick another percent from the list', async () => {
      await open();
      el().querySelector<HTMLElement>('[role="combobox"]')!.click();
      await settle();

      [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((option) => option.textContent?.trim() === '40%')!
        .click();
      await settle();
      await submit();

      expect(httpMock.expectOne(ALLOCATIONS_URL).request.body.percent).toBe(40);
    });

    it('accepts a period on the limits of the request, and a single day', async () => {
      await open();

      period(new Date(2026, 10, 1), new Date(2026, 10, 1));
      await submit();

      expect(httpMock.expectOne(ALLOCATIONS_URL).request.body).toMatchObject({
        startDate: '2026-11-01',
        endDate: '2026-11-01',
      });
    });
  });

  describe('a period the API would refuse (BR-3)', () => {
    it('does not accept a start before the request starts', async () => {
      await open();

      period(new Date(2026, 9, 31), new Date(2027, 0, 31));
      await submit();

      httpMock.expectNone(ALLOCATIONS_URL);
      expect(el().textContent).toContain('Dates must be between 01/11/2026 and 31/01/2027');
    });

    it('does not accept an end after the request ends', async () => {
      await open();

      period(new Date(2026, 10, 1), new Date(2027, 1, 1));
      await submit();

      httpMock.expectNone(ALLOCATIONS_URL);
      expect(el().textContent).toContain('Dates must be between 01/11/2026 and 31/01/2027');
    });

    it('does not accept an end before the start', async () => {
      await open();

      period(new Date(2027, 0, 31), new Date(2026, 10, 1));
      await submit();

      httpMock.expectNone(ALLOCATIONS_URL);
      expect(el().textContent).toContain('Start date must not be after end date');
    });

    it('asks for both dates', async () => {
      await open();

      period(null, null);
      await submit();

      httpMock.expectNone(ALLOCATIONS_URL);
      expect(el().textContent).toContain('Start and end dates are required');
    });
  });

  describe('when the API answers with an error', () => {
    it.each<[number, string, string]>([
      [
        400,
        'ALLOCATION_OUTSIDE_REQUEST',
        'The allocation period must be inside the request period',
      ],
      [400, 'MISSING_MANDATORY_SKILLS', "The employee doesn't have every required skill: Java"],
      [403, 'NOT_PROJECT_OWNER', 'Only the project manager who owns this project can propose'],
      [409, 'ALLOCATION_OVERLAP', 'This employee is already proposed or allocated on this request'],
      [409, 'REQUEST_NOT_OPEN', 'Only an open or partially filled request takes proposals'],
    ])('shows the %i %s message in the snackbar and stays open', async (status, code, message) => {
      await open();
      await submit();

      httpMock.expectOne(ALLOCATIONS_URL).flush({ code, message }, { status, statusText: 'Error' });
      await settle();

      expect(notifications.error).toHaveBeenCalledWith(message);
      expect(close).not.toHaveBeenCalled();
      expect(proposeButton().disabled).toBe(false);
    });

    it('can propose again after an error', async () => {
      await open();
      await submit();
      httpMock
        .expectOne(ALLOCATIONS_URL)
        .flush(
          { code: 'ALLOCATION_OUTSIDE_REQUEST', message: 'Outside' },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      await submit();

      httpMock.expectOne({ method: 'POST', url: ALLOCATIONS_URL }).flush(PROPOSAL);
      expect(close).toHaveBeenCalledWith(PROPOSAL);
    });
  });

  describe('while the proposal is on its way', () => {
    it('ignores a second submit', async () => {
      await open();

      await submit();
      await submit();

      httpMock.expectOne({ method: 'POST', url: ALLOCATIONS_URL });
    });

    it('cannot be dismissed, only after it fails', async () => {
      await open();

      await submit();

      // Escape and a click outside are blocked, and so are Cancel and a second Propose
      expect(dialogRef.disableClose).toBe(true);
      expect(cancelButton().disabled).toBe(true);
      expect(proposeButton().disabled).toBe(true);

      httpMock
        .expectOne(ALLOCATIONS_URL)
        .flush(
          { code: 'ALLOCATION_OVERLAP', message: 'Overlap' },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();

      expect(dialogRef.disableClose).toBe(false);
      expect(cancelButton().disabled).toBe(false);
      expect(proposeButton().disabled).toBe(false);
    });
  });

  it('closes without a proposal when the PM cancels', async () => {
    await open();

    cancelButton().click();
    await settle();

    // ssDialogClose closes with an empty result, so the page sees no proposal
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.calls[0][0]).toBeFalsy();
    httpMock.expectNone(ALLOCATIONS_URL);
  });
});
