import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { Page } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { DEPARTMENTS_URL } from '../departments/department.service';
import { UserDialog, UserDialogData } from './user-dialog';
import { UserAccount } from './user.models';
import { USERS_URL } from './user.service';
import { UsersPage } from './users-page';

const ADMIN: UserAccount = {
  id: 1,
  email: 'vukasin_admin@staffsync.local',
  firstName: 'Vukasin',
  lastName: 'Patkovic',
  role: 'ADMIN',
  department: null,
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
  capacityPercent: 80,
  active: true,
};
const GONE: UserAccount = { ...MARKO, id: 5, firstName: 'Gone', active: false };

function pageOf(...users: UserAccount[]): Page<UserAccount> {
  return {
    content: users,
    page: { size: 20, number: 0, totalElements: users.length, totalPages: 1 },
  };
}

describe('UsersPage', () => {
  let fixture: ComponentFixture<UsersPage>;
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let notifications: Notifications;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersPage],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: AuthService, useValue: { currentUser: signal({ id: ADMIN.id }) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(MatDialog), 'open');
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    vi.spyOn(notifications, 'success').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    httpMock.expectOne(DEPARTMENTS_URL).flush([{ id: 1, name: 'Engineering' }]);
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Answers the table's request for users, including one a `reload()` has just asked for. */
  async function load(page: Page<UserAccount> = pageOf(ADMIN, MARKO, GONE)) {
    await settle();
    const req = httpMock.expectOne((r) => r.method === 'GET' && r.url === USERS_URL);
    req.flush(page);
    await settle();
    return req.request;
  }

  function button(label: string): HTMLButtonElement | null {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  function closeDialogWith(result: unknown): void {
    dialogOpen.mockReturnValue({ afterClosed: () => of(result) } as never);
  }

  it('lists only active users at first', async () => {
    const request = await load();

    expect(request.params.get('active')).toBe('true');
    expect(request.params.has('role')).toBe(false);
    expect(request.params.has('departmentId')).toBe(false);
  });

  it('shows each user’s details and status', async () => {
    await load();

    const rows = [...el().querySelectorAll('tr.mat-mdc-row')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()),
    );
    expect(rows[1].slice(0, 8)).toEqual([
      'Marko Markovic',
      'marko@staffsync.local',
      'Employee',
      'Engineering',
      'Lazar Dunjic',
      'Senior',
      '80%',
      'Active',
    ]);
    expect(rows[2][7]).toBe('Inactive');
  });

  it('filters by role and goes back to the first page', async () => {
    await load();

    const selects = fixture.debugElement.queryAll(By.directive(MatSelect));
    (selects[1].componentInstance as MatSelect).open();
    await settle();
    [...document.querySelectorAll<HTMLElement>('mat-option')]
      .find((option) => option.textContent?.trim() === 'Resource Manager')!
      .click();
    await settle();

    const request = await load(pageOf());
    expect(request.params.get('role')).toBe('RM');
    expect(request.params.get('active')).toBe('true');
    expect(request.params.get('page')).toBe('0');
    expect(el().textContent).toContain('No users match the filters.');
  });

  it('offers Deactivate only for other active users', async () => {
    await load();

    expect(button('Deactivate Marko Markovic')).not.toBeNull();
    expect(button('Deactivate Vukasin Patkovic')).toBeNull();
    expect(button('Deactivate Gone Markovic')).toBeNull();
  });

  it('deactivates a confirmed user and reloads the table', async () => {
    await load();
    closeDialogWith(true);

    button('Deactivate Marko Markovic')!.click();
    httpMock
      .expectOne({ method: 'PATCH', url: `${USERS_URL}/4/deactivate` })
      .flush({ ...MARKO, active: false });
    await load(pageOf(ADMIN));

    expect(notifications.success).toHaveBeenCalledWith('Deactivated Marko Markovic');
  });

  it('does nothing when the deactivation is cancelled', async () => {
    await load();
    closeDialogWith(false);

    button('Deactivate Marko Markovic')!.click();
    await settle();

    httpMock.expectNone(`${USERS_URL}/4/deactivate`);
  });

  it('shows why a deactivation was refused (BR-12) and keeps the user', async () => {
    await load();
    closeDialogWith(true);

    button('Deactivate Marko Markovic')!.click();
    httpMock.expectOne(`${USERS_URL}/4/deactivate`).flush(
      {
        code: 'USER_HAS_ACTIVE_ALLOCATIONS',
        message: 'Marko Markovic has current or future allocations and can’t be deactivated',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    expect(notifications.error).toHaveBeenCalledWith(
      'Marko Markovic has current or future allocations and can’t be deactivated',
    );
    expect(notifications.success).not.toHaveBeenCalled();
    httpMock.expectNone((r) => r.url === USERS_URL);
  });

  it('opens the edit dialog with the user and the departments, and reloads after saving', async () => {
    await load();
    closeDialogWith({ ...MARKO, firstName: 'Mark' });

    button('Edit Marko Markovic')!.click();
    await load();

    expect(dialogOpen.mock.calls[0][0]).toBe(UserDialog);
    const { data } = dialogOpen.mock.calls[0][1] as { data: UserDialogData };
    expect(data.user).toEqual(MARKO);
    expect(data.departments()).toEqual([{ id: 1, name: 'Engineering' }]);
    expect(notifications.success).toHaveBeenCalledWith('User saved');
  });

  it('reloads after a user is created', async () => {
    await load();
    closeDialogWith(MARKO);

    el().querySelector<HTMLButtonElement>('header button')!.click();
    await load();

    expect(notifications.success).toHaveBeenCalledWith('User created');
  });
});

describe('Users route', () => {
  it('is open to Admin only', async () => {
    const shell = routes.find((route) => route.path === '');
    const route = shell?.children?.find((child) => child.path === 'admin/users');

    expect(await (route?.loadComponent as () => Promise<unknown>)()).toBe(UsersPage);
    expect(route?.data?.['roles']).toEqual(['ADMIN']);
    expect(route?.canActivate).toBeDefined();
  });
});
