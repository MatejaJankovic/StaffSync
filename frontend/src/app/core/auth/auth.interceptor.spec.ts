import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService, LOGIN_URL } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt-token');
    localStorage.setItem(
      'staffsync.user',
      JSON.stringify({ id: 1, email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN' }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => httpMock.verify());

  it('adds the bearer token to /api calls', () => {
    http.get('/api/projects').subscribe();
    const req = httpMock.expectOne('/api/projects');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    req.flush([]);
  });

  it('does not send the token to the login endpoint', () => {
    http.post(LOGIN_URL, {}).subscribe();
    const req = httpMock.expectOne(LOGIN_URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not send the token outside /api', () => {
    http.get('https://example.com/data').subscribe();
    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('clears the session and redirects to /login on 401', () => {
    let failed = false;
    http.get('/api/projects').subscribe({ error: () => (failed = true) });
    httpMock.expectOne('/api/projects').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('leaves the session alone on a failed login', () => {
    http.post(LOGIN_URL, {}).subscribe({ error: () => undefined });
    httpMock.expectOne(LOGIN_URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the session on 403', () => {
    http.get('/api/users').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/users').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(auth.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
