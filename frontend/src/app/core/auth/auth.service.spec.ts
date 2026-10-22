import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { User } from './auth.models';
import { AuthService, LOGIN_URL, ME_URL, PASSWORD_URL } from './auth.service';

const USER: User = {
  id: 2,
  email: 'pm@staffsync.local',
  firstName: 'Ana',
  lastName: 'Project',
  role: 'PM',
};

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  function setup(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => httpMock.verify());

  it('starts logged out when nothing is stored', () => {
    const auth = setup();
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.role()).toBeNull();
  });

  it('login stores the token and user and exposes the role', () => {
    const auth = setup();
    let result: User | undefined;
    auth.login('pm@staffsync.local', 'Password123!').subscribe((user) => (result = user));

    const req = httpMock.expectOne(LOGIN_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'pm@staffsync.local', password: 'Password123!' });
    req.flush({ token: 'jwt-token', user: USER });

    expect(result).toEqual(USER);
    expect(auth.token()).toBe('jwt-token');
    expect(auth.currentUser()).toEqual(USER);
    expect(auth.role()).toBe('PM');
    expect(auth.isLoggedIn()).toBe(true);
    expect(localStorage.getItem('staffsync.token')).toBe('jwt-token');
  });

  it('restores a stored session on start', () => {
    localStorage.setItem('staffsync.token', 'jwt-token');
    localStorage.setItem('staffsync.user', JSON.stringify(USER));
    const auth = setup();
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.role()).toBe('PM');
  });

  it('logout clears the session and goes to /login', () => {
    localStorage.setItem('staffsync.token', 'jwt-token');
    localStorage.setItem('staffsync.user', JSON.stringify(USER));
    const auth = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('staffsync.token')).toBeNull();
    expect(localStorage.getItem('staffsync.user')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('restoreSession does nothing without a token', async () => {
    const auth = setup();
    await auth.restoreSession();
    httpMock.expectNone(ME_URL);
  });

  it('restoreSession refreshes the user from /api/auth/me', async () => {
    localStorage.setItem('staffsync.token', 'jwt-token');
    const auth = setup();

    const restored = auth.restoreSession();
    httpMock.expectOne(ME_URL).flush(USER);
    await restored;

    expect(auth.currentUser()).toEqual(USER);
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('restoreSession clears an expired session without throwing', async () => {
    localStorage.setItem('staffsync.token', 'expired');
    localStorage.setItem('staffsync.user', JSON.stringify(USER));
    const auth = setup();

    const restored = auth.restoreSession();
    httpMock.expectOne(ME_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('staffsync.token')).toBeNull();
  });

  it('restoreSession keeps the session when the backend is down', async () => {
    localStorage.setItem('staffsync.token', 'jwt-token');
    localStorage.setItem('staffsync.user', JSON.stringify(USER));
    const auth = setup();

    const restored = auth.restoreSession();
    httpMock.expectOne(ME_URL).error(new ProgressEvent('error'), { status: 0 });
    await restored;

    expect(auth.isLoggedIn()).toBe(true);
    expect(localStorage.getItem('staffsync.token')).toBe('jwt-token');
  });

  it('changePassword PUTs the old and new password', () => {
    const auth = setup();
    let done = false;
    auth
      .changePassword({ oldPassword: 'Temporary1!', newPassword: 'NewPassword1!' })
      .subscribe(() => (done = true));

    const req = httpMock.expectOne({ method: 'PUT', url: PASSWORD_URL });
    expect(req.request.body).toEqual({ oldPassword: 'Temporary1!', newPassword: 'NewPassword1!' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
  });

  it('restoreSession keeps the session on a server error', async () => {
    localStorage.setItem('staffsync.token', 'jwt-token');
    localStorage.setItem('staffsync.user', JSON.stringify(USER));
    const auth = setup();

    const restored = auth.restoreSession();
    httpMock.expectOne(ME_URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await restored;

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.role()).toBe('PM');
  });
});
