import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { Department } from './department.models';
import { DEPARTMENTS_URL } from './department.service';
import { DepartmentDialog, DepartmentDialogData } from './department-dialog';

describe('DepartmentDialog', () => {
  let fixture: ComponentFixture<DepartmentDialog>;
  let httpMock: HttpTestingController;
  let notifications: Notifications;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  async function open(data: DepartmentDialogData): Promise<void> {
    close.mockReset();
    dialogRef.disableClose = false;
    await TestBed.configureTestingModule({
      imports: [DepartmentDialog],
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
    fixture = TestBed.createComponent(DepartmentDialog);
    await fixture.whenStable();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function setName(name: string): void {
    fixture.componentInstance['form'].setValue({ name });
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  function saveButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  function cancelButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[ss-dialog-close]')!;
  }

  it('starts empty for a new department', async () => {
    await open({});

    expect(el().textContent).toContain('Add department');
    expect(el().querySelector<HTMLInputElement>('input')!.value).toBe('');
  });

  it('starts with the current name when renaming', async () => {
    await open({ department: { id: 1, name: 'Engineering' } });

    expect(el().textContent).toContain('Rename department');
    expect(el().querySelector<HTMLInputElement>('input')!.value).toBe('Engineering');
  });

  it('does not call the API for a blank name', async () => {
    await open({});
    setName('   ');

    await submit();

    httpMock.expectNone(DEPARTMENTS_URL);
    expect(el().textContent).toContain('Name is required');
  });

  it('shows an error for a name over 100 characters and does not call the API', async () => {
    await open({});
    setName('x'.repeat(101));

    await submit();

    httpMock.expectNone(DEPARTMENTS_URL);
    expect(el().textContent).toContain('Name must be at most 100 characters');
  });

  it('rejects control characters in the name without calling the API', async () => {
    await open({});
    setName('a\nb');

    await submit();

    httpMock.expectNone(DEPARTMENTS_URL);
    expect(el().textContent).toContain('Name must not contain control characters');
  });

  it('creates a department with a trimmed name', async () => {
    await open({});
    const saved: Department = { id: 9, name: 'Sales' };
    setName('  Sales  ');

    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: DEPARTMENTS_URL });
    expect(req.request.body).toEqual({ name: 'Sales' });
    req.flush(saved);
    expect(close).toHaveBeenCalledWith(saved);
  });

  it('renames the department it was opened with', async () => {
    await open({ department: { id: 1, name: 'Engineering' } });
    setName('Software engineering');

    await submit();

    const req = httpMock.expectOne({ method: 'PUT', url: `${DEPARTMENTS_URL}/1` });
    expect(req.request.body).toEqual({ name: 'Software engineering' });
    req.flush({ id: 1, name: 'Software engineering' });
    expect(close).toHaveBeenCalledWith({ id: 1, name: 'Software engineering' });
  });

  it('shows a duplicate name (409) in the snackbar and stays open to fix it', async () => {
    await open({});
    setName('Engineering');

    await submit();
    expect(saveButton().disabled).toBe(true);

    httpMock.expectOne(DEPARTMENTS_URL).flush(
      {
        code: 'DEPARTMENT_NAME_TAKEN',
        message: "A department named 'Engineering' already exists",
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(notifications.error).toHaveBeenCalledWith(
      "A department named 'Engineering' already exists",
    );
    expect(close).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(false);
  });

  it('cannot be dismissed while the request is in flight, only after it fails', async () => {
    await open({});
    setName('Engineering');

    await submit();

    // Escape and a click outside are blocked, and so is Cancel
    expect(dialogRef.disableClose).toBe(true);
    expect(cancelButton().disabled).toBe(true);

    httpMock
      .expectOne(DEPARTMENTS_URL)
      .flush(
        { code: 'DEPARTMENT_NAME_TAKEN', message: 'taken' },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(dialogRef.disableClose).toBe(false);
    expect(cancelButton().disabled).toBe(false);
  });
});
