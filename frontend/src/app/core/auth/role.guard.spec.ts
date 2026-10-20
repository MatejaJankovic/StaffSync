import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { roleGuard } from './role.guard';
import { Role } from './auth.models';

describe('roleGuard', () => {
  function run(role: Role | null, roles?: Role[]): boolean | UrlTree {
    localStorage.clear();
    if (role) {
      localStorage.setItem('staffsync.token', 'jwt');
      localStorage.setItem(
        'staffsync.user',
        JSON.stringify({ id: 1, email: 'x', firstName: 'X', lastName: 'Y', role }),
      );
    }
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    const route = { data: roles ? { roles } : {} } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(
      () => roleGuard(route, {} as RouterStateSnapshot) as boolean | UrlTree,
    );
  }

  it('allows a listed role', () => {
    expect(run('RM', ['PM', 'RM'])).toBe(true);
  });

  it('redirects another role to /home', () => {
    const result = run('EMPLOYEE', ['ADMIN']);
    expect(result instanceof UrlTree && result.toString()).toBe('/home');
  });

  it('allows any logged-in user when no roles are set', () => {
    expect(run('EMPLOYEE')).toBe(true);
  });

  it('redirects when there is no user', () => {
    expect(run(null, ['ADMIN'])).toBeInstanceOf(UrlTree);
  });
});
