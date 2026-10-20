import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from './auth.models';
import { AuthService } from './auth.service';

/**
 * Allows the route only for the roles in `data: { roles: [...] }`. A route without `roles`
 * is open to every logged-in user. Anyone else is sent to Home.
 */
export const roleGuard: CanActivateFn = (route) => {
  const roles = route.data['roles'] as readonly Role[] | undefined;
  const role = inject(AuthService).role();
  if (!roles || (role !== null && roles.includes(role))) {
    return true;
  }
  return inject(Router).createUrlTree(['/home']);
};
