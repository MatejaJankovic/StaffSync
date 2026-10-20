import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { authGuard, guestGuard } from './auth.guard';

describe('authGuard and guestGuard', () => {
  function setup(loggedIn: boolean): void {
    localStorage.clear();
    if (loggedIn) {
      localStorage.setItem('staffsync.token', 'jwt');
      localStorage.setItem(
        'staffsync.user',
        JSON.stringify({ id: 1, email: 'x', firstName: 'X', lastName: 'Y', role: 'PM' }),
      );
    }
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  }

  function run(guard: typeof authGuard): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot) as boolean | UrlTree,
    );
  }

  it('authGuard lets a logged-in user through', () => {
    setup(true);
    expect(run(authGuard)).toBe(true);
  });

  it('authGuard sends a logged-out user to /login', () => {
    setup(false);
    const result = run(authGuard);
    expect(result instanceof UrlTree && result.toString()).toBe('/login');
  });

  it('guestGuard sends a logged-in user to /home', () => {
    setup(true);
    const result = run(guestGuard);
    expect(result instanceof UrlTree && result.toString()).toBe('/home');
  });

  it('guestGuard lets a logged-out user see the login page', () => {
    setup(false);
    expect(run(guestGuard)).toBe(true);
  });
});
