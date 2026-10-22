import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { errorInterceptor } from '../error/error.interceptor';
import { Notifications } from '../error/notifications';
import { PASSWORD_URL } from './auth.service';
import { ChangePasswordDialog } from './change-password-dialog';

describe('ChangePasswordDialog', () => {
  let fixture: ComponentFixture<ChangePasswordDialog>;
  let httpMock: HttpTestingController;
  let notifications: Notifications;
  const close = vi.fn();
  const dialogRef = { close, disableClose: false };

  beforeEach(async () => {
    close.mockReset();
    dialogRef.disableClose = false;
    await TestBed.configureTestingModule({
      imports: [ChangePasswordDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(Notifications);
    vi.spyOn(notifications, 'error').mockImplementation(() => undefined);
    vi.spyOn(notifications, 'success').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(ChangePasswordDialog);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function fill(oldPassword: string, newPassword: string, confirmPassword = newPassword): void {
    fixture.componentInstance['form'].setValue({ oldPassword, newPassword, confirmPassword });
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  function saveButton(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  it('asks for all three fields without calling the API', async () => {
    await submit();

    httpMock.expectNone(PASSWORD_URL);
    expect(el().textContent).toContain('Current password is required');
    expect(el().textContent).toContain('New password is required');
    expect(el().textContent).toContain('Confirm the new password');
  });

  it('rejects a new password shorter than 8 characters', async () => {
    fill('Temporary1!', 'Short7!');

    await submit();

    httpMock.expectNone(PASSWORD_URL);
    expect(el().textContent).toContain('New password must be at least 8 characters');
  });

  it('rejects a confirmation that does not match', async () => {
    fill('Temporary1!', 'NewPassword1!', 'NewPassword2!');

    await submit();

    httpMock.expectNone(PASSWORD_URL);
    expect(el().textContent).toContain('Passwords do not match');
  });

  it('changes the password, shows a snackbar and closes', async () => {
    fill('Temporary1!', 'NewPassword1!');

    await submit();

    const req = httpMock.expectOne({ method: 'PUT', url: PASSWORD_URL });
    expect(req.request.body).toEqual({ oldPassword: 'Temporary1!', newPassword: 'NewPassword1!' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(notifications.success).toHaveBeenCalledWith('Password changed');
    expect(close).toHaveBeenCalledWith(true);
  });

  it('shows a wrong current password (400) on its field and stays open', async () => {
    fill('wrong-password', 'NewPassword1!');

    await submit();
    expect(saveButton().disabled).toBe(true);
    expect(dialogRef.disableClose).toBe(true);

    httpMock
      .expectOne(PASSWORD_URL)
      .flush(
        { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();

    expect(el().textContent).toContain('Current password is incorrect');
    expect(notifications.error).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(false);
    expect(dialogRef.disableClose).toBe(false);
  });

  it("shows any other error's message inside the dialog", async () => {
    fill('Temporary1!', 'NewPassword1!');

    await submit();
    httpMock
      .expectOne(PASSWORD_URL)
      .flush(
        { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'An unexpected error occurred',
    );
    expect(notifications.error).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
