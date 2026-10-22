import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { errorInterceptor } from '../../core/error/error.interceptor';
import { Notifications } from '../../core/error/notifications';
import { Department } from './department.models';
import { DEPARTMENTS_URL } from './department.service';
import { DepartmentDialog } from './department-dialog';
import { DepartmentsPage } from './departments-page';

const DEPARTMENTS: Department[] = [
  { id: 2, name: 'Sales' },
  { id: 1, name: 'Engineering' },
  { id: 3, name: 'Design' },
];

describe('DepartmentsPage', () => {
  let fixture: ComponentFixture<DepartmentsPage>;
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let notifications: Notifications;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartmentsPage],
      // The real error interceptor, so the 409s are shown the way they are in the app
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(MatDialog), 'open');
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    vi.spyOn(notifications, 'success').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(DepartmentsPage);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function loadDepartments(departments: Department[] = DEPARTMENTS): Promise<void> {
    httpMock.expectOne(DEPARTMENTS_URL).flush(departments);
    await fixture.whenStable();
  }

  function names(): (string | undefined)[] {
    return [...el().querySelectorAll('td.mat-column-name')].map((c) => c.textContent?.trim());
  }

  function closeDialogWith(result: unknown): void {
    dialogOpen.mockReturnValue({ afterClosed: () => of(result) } as never);
  }

  function clickButton(label: string): void {
    el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
  }

  it('lists the departments sorted by name', async () => {
    await loadDepartments();

    expect(names()).toEqual(['Design', 'Engineering', 'Sales']);
  });

  it('says so when there are no departments', async () => {
    await loadDepartments([]);

    expect(el().textContent).toContain('There are no departments yet');
  });

  it('offers a retry when loading fails', async () => {
    httpMock.expectOne(DEPARTMENTS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Unable to load');
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await loadDepartments();

    expect(names()).toEqual(['Design', 'Engineering', 'Sales']);
  });

  it('adds a saved department in name order', async () => {
    await loadDepartments();
    closeDialogWith({ id: 4, name: 'Marketing' });

    el().querySelector<HTMLButtonElement>('header button')!.click();
    await fixture.whenStable();

    expect(dialogOpen).toHaveBeenCalledWith(
      DepartmentDialog,
      expect.objectContaining({ data: {} }),
    );
    expect(names()).toEqual(['Design', 'Engineering', 'Marketing', 'Sales']);
    expect(notifications.success).toHaveBeenCalledWith('Department added');
  });

  it('shows a renamed department under its new name', async () => {
    await loadDepartments();
    closeDialogWith({ id: 2, name: 'Account management' });

    clickButton('Rename Sales');
    await fixture.whenStable();

    expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: { department: DEPARTMENTS[0] } });
    expect(names()).toEqual(['Account management', 'Design', 'Engineering']);
    expect(notifications.success).toHaveBeenCalledWith('Department renamed');
  });

  it('changes nothing when the dialog is cancelled', async () => {
    await loadDepartments();
    closeDialogWith(undefined);

    clickButton('Rename Sales');
    await fixture.whenStable();

    expect(names()).toEqual(['Design', 'Engineering', 'Sales']);
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    await loadDepartments();
    closeDialogWith(false);

    clickButton('Delete Sales');
    await fixture.whenStable();

    httpMock.expectNone(`${DEPARTMENTS_URL}/2`);
    expect(names()).toContain('Sales');
  });

  it('deletes a confirmed department and removes it from the list', async () => {
    await loadDepartments();
    closeDialogWith(true);

    clickButton('Delete Sales');
    httpMock.expectOne({ method: 'DELETE', url: `${DEPARTMENTS_URL}/2` }).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await fixture.whenStable();

    expect(names()).toEqual(['Design', 'Engineering']);
    expect(notifications.success).toHaveBeenCalledWith('Deleted Sales');
  });

  it('keeps a department that still has users and shows the 409 in the snackbar', async () => {
    await loadDepartments();
    closeDialogWith(true);

    clickButton('Delete Engineering');
    httpMock.expectOne({ method: 'DELETE', url: `${DEPARTMENTS_URL}/1` }).flush(
      {
        code: 'DEPARTMENT_IN_USE',
        message: "Department 'Engineering' still has users and cannot be deleted",
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(names()).toContain('Engineering');
    expect(notifications.error).toHaveBeenCalledWith(
      "Department 'Engineering' still has users and cannot be deleted",
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

describe('Departments route', () => {
  it('is open to Admin only', async () => {
    const shell = routes.find((route) => route.path === '');
    const route = shell?.children?.find((child) => child.path === 'admin/departments');

    expect(await (route?.loadComponent as () => Promise<unknown>)()).toBe(DepartmentsPage);
    expect(route?.data?.['roles']).toEqual(['ADMIN']);
    expect(route?.canActivate).toBeDefined();
  });
});
