import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { UserDialog, UserDialogData } from './user-dialog';
import { UserAccount } from './user.models';
import { USERS_URL } from './user.service';

const LAZAR: UserAccount = {
  id: 3,
  email: 'lazar_rm@staffsync.local',
  firstName: 'Lazar',
  lastName: 'Dunjic',
  role: 'RM',
  department: { id: 1, name: 'Engineering' },
  manager: null,
  seniority: null,
  capacityPercent: 100,
  active: true,
};
const MARKO: UserAccount = {
  id: 4,
  email: 'marko@staffsync.local',
  firstName: 'Marko',
  lastName: 'Markovic',
  role: 'EMPLOYEE',
  department: { id: 1, name: 'Engineering' },
  manager: { id: 3, firstName: 'Lazar', lastName: 'Dunjic' },
  seniority: 'SENIOR',
  capacityPercent: 100,
  active: true,
};
const DEPARTMENTS = [{ id: 1, name: 'Engineering' }];
/** The Admin who is logged in. */
const ADMIN_ID = 1;

describe('UserDialog', () => {
  let fixture: ComponentFixture<UserDialog>;
  let httpMock: HttpTestingController;
  let notifications: Notifications;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  /** Opens the dialog and answers its requests for the active RMs, one page per entry. */
  async function open(data: UserDialogData, managerPages: UserAccount[][] = [[LAZAR]]) {
    close.mockReset();
    dialogRef.disableClose = false;
    await TestBed.configureTestingModule({
      imports: [UserDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AuthService, useValue: { currentUser: signal({ id: ADMIN_ID }) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(UserDialog);
    fixture.detectChanges();
    const totalElements = managerPages.flat().length;
    managerPages.forEach((content, number) => {
      const managers = httpMock.expectOne((r) => r.url === USERS_URL && r.method === 'GET');
      expect(managers.request.params.get('role')).toBe('RM');
      expect(managers.request.params.get('active')).toBe('true');
      expect(managers.request.params.get('page')).toBe(String(number));
      managers.flush({
        content,
        page: { size: 100, number, totalElements, totalPages: managerPages.length },
      });
    });
    await settle();
  }

  /** The texts of a dropdown's options, read by opening it. */
  async function options(control: string): Promise<string[]> {
    const select = fixture.debugElement
      .query(By.css(`mat-select[formcontrolname="${control}"]`))
      .injector.get(MatSelect);
    select.open();
    await settle();
    const texts = [...document.querySelectorAll('mat-option')].map((o) => o.textContent!.trim());
    select.close();
    await settle();
    return texts;
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function form() {
    return fixture.componentInstance['form'];
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  function fillEmployee(): void {
    form().patchValue({
      email: 'jelena@staffsync.local',
      firstName: '  Jelena ',
      lastName: 'Petrovic',
      role: 'EMPLOYEE',
      departmentId: 1,
      managerId: 3,
      seniority: 'MEDIOR',
      capacityPercent: 80,
      temporaryPassword: 'Welcome2026!',
    });
  }

  it('requires a department, a resource manager and a temporary password for a new employee', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    form().patchValue({ email: 'a@b.c', firstName: 'A', lastName: 'B' });

    await submit();

    httpMock.expectNone({ method: 'POST', url: USERS_URL });
    expect(el().textContent).toContain('An employee needs a department');
    expect(el().textContent).toContain('An employee needs a resource manager');
    expect(el().textContent).toContain('Temporary password is required');
  });

  it('creates an employee with a temporary password', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    fillEmployee();

    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: USERS_URL });
    expect(req.request.body).toEqual({
      email: 'jelena@staffsync.local',
      firstName: 'Jelena',
      lastName: 'Petrovic',
      role: 'EMPLOYEE',
      departmentId: 1,
      managerId: 3,
      seniority: 'MEDIOR',
      capacityPercent: 80,
      temporaryPassword: 'Welcome2026!',
    });
    req.flush({ ...MARKO, id: 9 });
    expect(close).toHaveBeenCalledWith({ ...MARKO, id: 9 });
  });

  it('hides the resource manager and sends none for other roles', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    fillEmployee();
    form().patchValue({ role: 'PM', departmentId: null });
    await settle();

    expect(el().textContent).not.toContain('Resource manager');
    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: USERS_URL });
    expect(req.request.body).toMatchObject({ role: 'PM', departmentId: null, managerId: null });
    req.flush({ ...LAZAR, role: 'PM' });
  });

  it('generates a temporary password and shows it', async () => {
    await open({ departments: signal(DEPARTMENTS) });

    [...el().querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Generate password'))!
      .click();
    await settle();

    const input = el().querySelector<HTMLInputElement>(
      'input[formcontrolname="temporaryPassword"]',
    )!;
    expect(input.value).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(input.type).toBe('text');
  });

  it('shows a taken email next to the field, not in the snackbar', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    fillEmployee();

    await submit();
    httpMock.expectOne({ method: 'POST', url: USERS_URL }).flush(
      {
        code: 'EMAIL_TAKEN',
        message: "A user with email 'jelena@staffsync.local' already exists",
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(el().textContent).toContain("A user with email 'jelena@staffsync.local' already exists");
    expect(notifications.error).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(dialogRef.disableClose).toBe(false);
  });

  it('shows field errors from the API next to their fields', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    fillEmployee();

    await submit();
    httpMock.expectOne({ method: 'POST', url: USERS_URL }).flush(
      {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: [
          { field: 'managerId', message: 'The manager must be an active resource manager' },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(el().textContent).toContain('The manager must be an active resource manager');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('edits a user without a password field', async () => {
    await open({ user: MARKO, departments: signal(DEPARTMENTS) });

    expect(el().textContent).toContain('Edit user');
    expect(el().querySelector('input[formcontrolname="temporaryPassword"]')).toBeNull();
    form().patchValue({ firstName: 'Mark' });
    await submit();

    const req = httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/4` });
    expect(req.request.body).toEqual({
      email: 'marko@staffsync.local',
      firstName: 'Mark',
      lastName: 'Markovic',
      role: 'EMPLOYEE',
      departmentId: 1,
      managerId: 3,
      seniority: 'SENIOR',
      capacityPercent: 100,
    });
    req.flush({ ...MARKO, firstName: 'Mark' });
    expect(close).toHaveBeenCalledWith({ ...MARKO, firstName: 'Mark' });
  });

  it('lists the days a lower capacity would overbook (BR-13)', async () => {
    await open({ user: MARKO, departments: signal(DEPARTMENTS) });
    form().patchValue({ capacityPercent: 50 });

    await submit();
    const days = [
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
    ];
    httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/4` }).flush(
      {
        code: 'CAPACITY_EXCEEDED',
        message: 'Lowering capacity to 50% would leave existing allocations over it on 6 days',
        details: days.map((date) => ({ date, load: 80 })),
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    const text = el().textContent ?? '';
    expect(text).toContain(
      'Lowering capacity to 50% would leave existing allocations over it on 6 days',
    );
    expect(text).toContain('Too low for existing allocations');
    expect(text).toContain('2 Nov 2026: 80% allocated');
    expect(text).toContain('6 Nov 2026: 80% allocated');
    expect(text).not.toContain('9 Nov 2026');
    expect(text).toContain('and 1 more day.');
    expect(notifications.error).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    // A different capacity may fit, so the old days go away
    form().patchValue({ capacityPercent: 80 });
    await settle();
    expect(el().textContent).not.toContain('Lowering capacity');
  });

  it('explains why an RM with a team keeps the RM role', async () => {
    await open({ user: LAZAR, departments: signal(DEPARTMENTS) });
    form().patchValue({ role: 'PM' });

    await submit();
    httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/3` }).flush(
      {
        code: 'RM_HAS_TEAM',
        message: 'This resource manager still has active employees and can’t be given another role',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(el().textContent).toContain(
      'This resource manager still has active employees and can’t be given another role',
    );
    expect(el().textContent).toContain('Still has active employees');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('shows other errors in the snackbar', async () => {
    await open({ user: MARKO, departments: signal(DEPARTMENTS) });

    await submit();
    httpMock
      .expectOne({ method: 'PUT', url: `${USERS_URL}/4` })
      .flush(
        { code: 'NOT_FOUND', message: 'User 4 not found' },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(notifications.error).toHaveBeenCalledWith('User 4 not found');
  });

  it('offers the departments that load after it opens', async () => {
    const departments = signal<typeof DEPARTMENTS>([]);
    await open({ departments });

    departments.set([...DEPARTMENTS, { id: 2, name: 'Design' }]);
    await settle();

    expect(await options('departmentId')).toEqual(['Engineering', 'Design']);
  });

  it('offers the resource managers from every page', async () => {
    const mila: UserAccount = { ...LAZAR, id: 7, firstName: 'Mila', lastName: 'Zivkovic' };
    await open({ departments: signal(DEPARTMENTS) }, [[LAZAR], [mila]]);

    expect(await options('managerId')).toEqual(['Lazar Dunjic', 'Mila Zivkovic']);
  });

  it('doesn’t offer an RM becoming an employee as their own resource manager', async () => {
    await open({ user: LAZAR, departments: signal(DEPARTMENTS) });
    form().patchValue({ role: 'EMPLOYEE' });
    await settle();

    expect(await options('managerId')).toEqual([]);
  });

  it('keeps an inactive employee’s resource manager who is no longer active', async () => {
    const archived: UserAccount = {
      ...MARKO,
      active: false,
      manager: { id: 8, firstName: 'Former', lastName: 'Lead' },
    };
    await open({ user: archived, departments: signal(DEPARTMENTS) });

    expect(await options('managerId')).toEqual(['Former Lead', 'Lazar Dunjic']);
    await submit();
    const req = httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/4` });
    expect(req.request.body).toMatchObject({ managerId: 8 });
    req.flush(archived);
  });

  it('doesn’t let the Admin change their own role', async () => {
    const admin: UserAccount = { ...LAZAR, id: ADMIN_ID, role: 'ADMIN', department: null };
    await open({ user: admin, departments: signal(DEPARTMENTS) });

    expect(form().controls.role.disabled).toBe(true);
    expect(el().textContent).toContain('You can’t change your own role');
    await submit();
    const req = httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/${ADMIN_ID}` });
    expect(req.request.body).toMatchObject({ role: 'ADMIN' });
    req.flush(admin);
  });

  it('counts the temporary password in bytes, as the API does', async () => {
    await open({ departments: signal(DEPARTMENTS) });
    fillEmployee();
    // 40 characters, but č is 2 bytes in UTF-8
    form().patchValue({ temporaryPassword: 'č'.repeat(40) });

    await submit();

    httpMock.expectNone({ method: 'POST', url: USERS_URL });
    expect(el().textContent).toContain('Temporary password must be at most 72 bytes');
  });

  it('explains why an employee with allocations keeps the employee role', async () => {
    await open({ user: MARKO, departments: signal(DEPARTMENTS) });
    form().patchValue({ role: 'PM' });

    await submit();
    httpMock.expectOne({ method: 'PUT', url: `${USERS_URL}/4` }).flush(
      {
        code: 'USER_HAS_ACTIVE_ALLOCATIONS',
        message:
          'Marko Markovic has current or future allocations or proposals and must stay an employee',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(el().textContent).toContain('and must stay an employee');
    expect(el().textContent).toContain('Still has allocations');
    expect(notifications.error).not.toHaveBeenCalled();
  });
});
