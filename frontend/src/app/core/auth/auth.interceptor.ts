import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService, LOGIN_URL } from './auth.service';

/**
 * Adds `Authorization: Bearer <token>` to /api calls. A 401 from any call except the login
 * itself means the token is missing, invalid or expired: the session is cleared and the user
 * goes back to the login page. That only happens if the request used the current token, so a
 * late 401 for an old token can't end a session started after it.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith('/api/');
  const isLogin = req.url === LOGIN_URL;
  const token = auth.token();

  const request =
    isApi && !isLogin && token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        isApi &&
        !isLogin &&
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        token === auth.token()
      ) {
        auth.clearSession();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
