import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { LOGIN_URL } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function fill(email: string, password: string): void {
    const emailInput = el().querySelector<HTMLInputElement>('input[formControlName="email"]')!;
    const passwordInput = el().querySelector<HTMLInputElement>(
      'input[formControlName="password"]',
    )!;
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('does not call the API when the form is invalid', async () => {
    fill('not-an-email', '');
    await submit();

    httpMock.expectNone(LOGIN_URL);
    expect(el().textContent).toContain('Enter a valid email address');
    expect(el().textContent).toContain('Password is required');
  });

  it('logs in and goes to /home', async () => {
    fill('pm@staffsync.local', 'Password123!');
    await submit();

    httpMock.expectOne(LOGIN_URL).flush({
      token: 'jwt',
      user: { id: 2, email: 'pm@staffsync.local', firstName: 'Ana', lastName: 'P', role: 'PM' },
    });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/home']);
  });

  it('shows a clear message on 401', async () => {
    fill('pm@staffsync.local', 'wrong');
    await submit();

    httpMock.expectOne(LOGIN_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Invalid email or password.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a generic message when the server is unreachable', async () => {
    fill('pm@staffsync.local', 'Password123!');
    await submit();

    httpMock.expectOne(LOGIN_URL).flush(null, { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Unable to sign in');
  });
});
