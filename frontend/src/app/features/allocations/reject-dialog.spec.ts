import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { Allocation, PendingApproval } from './allocation.models';
import { RejectDialog } from './reject-dialog';

const COMMENT = 'Fully booked on Project Beta until December';

const JELENA: Allocation = {
  id: 2,
  employeeId: 102,
  employeeName: 'Jelena Jovic',
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
  decidedByName: null,
  decisionComment: null,
};

const NEW: PendingApproval = {
  type: 'NEW',
  allocation: JELENA,
  proposedById: 7,
  proposedByName: 'Ana PM',
  awaitingSince: '2026-10-22T09:00:00Z',
  capacityPercent: 100,
  peakLoad: 60,
  overCapacityDays: 0,
};

const CHANGE: PendingApproval = {
  type: 'CHANGE',
  allocation: {
    ...JELENA,
    employeeName: 'Marko Markovic',
    status: 'CHANGE_PENDING',
    pendingPercent: 80,
    pendingStartDate: JELENA.startDate,
    pendingEndDate: JELENA.endDate,
    changeReason: 'The client asked for more work',
    decidedByName: null,
    decisionComment: null,
  },
  proposedById: 7,
  proposedByName: 'Ana PM',
  awaitingSince: '2026-10-22T09:00:00Z',
  capacityPercent: 100,
  peakLoad: 60,
  overCapacityDays: 0,
};

const REJECT_URL = '/api/allocations/2/reject';

describe('RejectDialog', () => {
  let fixture: ComponentFixture<RejectDialog>;
  let httpMock: HttpTestingController;
  let notificationsError: ReturnType<typeof vi.spyOn>;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  async function open(item: PendingApproval = NEW): Promise<void> {
    close.mockReset();
    dialogRef.disableClose = false;
    await TestBed.configureTestingModule({
      imports: [RejectDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: SS_DIALOG_DATA, useValue: item },
        { provide: SsDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    notificationsError = vi
      .spyOn(TestBed.inject(Notifications), 'error')
      .mockImplementation(() => undefined);
    fixture = TestBed.createComponent(RejectDialog);
    await settle();
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

  async function comment(text: string): Promise<void> {
    const textarea = el().querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  function fieldError(): string | undefined {
    return el().querySelector('ss-error')?.textContent?.trim();
  }

  it('says who is rejected, on which request, and what happens', async () => {
    await open();

    expect(el().querySelector('h2')?.textContent).toContain('Reject Jelena Jovic');
    expect(el().textContent).toContain('Java Developer · Project Alpha');
    expect(el().textContent).toContain('The proposal is rejected and can’t be decided again.');
    expect(el().querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Reject');
  });

  it('shows the change being rejected, and that the current values stay', async () => {
    await open(CHANGE);

    expect(el().querySelector('h2')?.textContent).toContain('Reject the change for Marko Markovic');
    expect(el().querySelector('.change-diff__new')?.textContent).toBe('80%');
    expect(el().textContent).toContain('The change is dropped, and Marko Markovic stays at 60%.');
    expect(el().querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Reject change');
  });

  // T-14, T-34: checked in the form before the API checks it again (BR-6)
  it.each<[string, string]>([
    ['', 'Comment is required'],
    ['          ', 'Comment is required'],
    ['Too short', 'Comment must be at least 10 characters'],
    ['  Too short ', 'Comment must be at least 10 characters'],
  ])('does not send the comment "%s" and says why', async (text, message) => {
    await open(CHANGE);

    await comment(text);
    await submit();

    expect(fieldError()).toBe(message);
    httpMock.expectNone(REJECT_URL);
    expect(close).not.toHaveBeenCalled();
  });

  it('does not send a comment longer than 1000 characters', async () => {
    await open();

    await comment('x'.repeat(1001));
    await submit();

    expect(fieldError()).toBe('Comment must be at most 1000 characters');
    httpMock.expectNone(REJECT_URL);
  });

  it('rejects with the trimmed comment and closes with the decided allocation', async () => {
    await open();

    await comment(`  ${COMMENT} `);
    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: REJECT_URL });
    expect(req.request.body).toEqual({ comment: COMMENT });
    expect(dialogRef.disableClose).toBe(true);
    const rejected = { ...JELENA, status: 'REJECTED' };
    req.flush(rejected);
    expect(close).toHaveBeenCalledWith(rejected);
  });

  it('stays open and editable when the API refuses, with its message in the snackbar', async () => {
    await open();

    await comment(COMMENT);
    await submit();
    httpMock.expectOne(REJECT_URL).flush(
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

    expect(close).not.toHaveBeenCalled();
    expect(dialogRef.disableClose).toBe(false);
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(notificationsError).toHaveBeenCalledWith(
      'Only a proposed allocation or a pending change can be approved or rejected, but this one is cancelled',
    );
  });
});
