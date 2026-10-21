import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor, skipErrorSnackbar } from './error.interceptor';
import { Notifications } from './notifications';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let showError: ReturnType<typeof vi.fn>;

  const apiError = {
    timestamp: '2026-11-03T10:15:30Z',
    status: 409,
    code: 'CAPACITY_EXCEEDED',
    message: 'Capacity exceeded on 3 days',
    details: [{ date: '2026-11-10', load: 110 }],
  };

  beforeEach(() => {
    showError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Notifications, useValue: { error: showError, success: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("shows the API's message and still passes the error on", () => {
    let received: unknown;
    http.post('/api/allocations/1/approve', {}).subscribe({ error: (e) => (received = e) });
    httpMock
      .expectOne('/api/allocations/1/approve')
      .flush(apiError, { status: 409, statusText: 'Conflict' });

    expect(showError).toHaveBeenCalledWith('Capacity exceeded on 3 days');
    expect(received).toBeDefined();
  });

  it('falls back to a generic message when the body is not the standard format', () => {
    http.get('/api/projects').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/projects').flush('oops', { status: 502, statusText: 'Bad Gateway' });

    expect(showError).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });

  it('says the server is unreachable on a network error', () => {
    http.get('/api/projects').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/projects').error(new ProgressEvent('error'), { status: 0 });

    expect(showError).toHaveBeenCalledWith('Cannot reach the server. Please try again.');
  });

  it('leaves 401 to the auth interceptor', () => {
    http.get('/api/auth/me').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/auth/me')
      .flush({ ...apiError, status: 401 }, { status: 401, statusText: 'Unauthorized' });

    expect(showError).not.toHaveBeenCalled();
  });

  it('stays quiet for a request marked with skipErrorSnackbar()', () => {
    http.get('/api/health', { context: skipErrorSnackbar() }).subscribe({ error: () => undefined });
    httpMock.expectOne('/api/health').flush(apiError, { status: 503, statusText: 'Unavailable' });

    expect(showError).not.toHaveBeenCalled();
  });

  it('ignores calls outside /api', () => {
    http.get('https://example.com/data').subscribe({ error: () => undefined });
    httpMock
      .expectOne('https://example.com/data')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(showError).not.toHaveBeenCalled();
  });

  it('shows nothing for a successful call', () => {
    http.get('/api/projects').subscribe();
    httpMock.expectOne('/api/projects').flush([]);

    expect(showError).not.toHaveBeenCalled();
  });
});
