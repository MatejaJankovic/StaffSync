import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { apiErrorMessage } from '../api/api-error';
import { Notifications } from './notifications';

/** Set on a request whose errors the caller shows itself, e.g. inline in a form. */
export const SKIP_ERROR_SNACKBAR = new HttpContextToken<boolean>(() => false);

/** `http.post(url, body, { context: skipErrorSnackbar() })` */
export function skipErrorSnackbar(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_SNACKBAR, true);
}

/**
 * Shows the API's error `message` in a snackbar for any failed /api call, then rethrows, so
 * pages only handle errors when they need to do more than show the message. A 401 is left to
 * the auth interceptor, which sends the user back to the login page.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(Notifications);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        req.url.startsWith('/api/') &&
        !req.context.get(SKIP_ERROR_SNACKBAR) &&
        error instanceof HttpErrorResponse &&
        error.status !== 401
      ) {
        notifications.error(apiErrorMessage(error));
      }
      return throwError(() => error);
    }),
  );
};
