import { HttpErrorResponse } from '@angular/common/http';

/** The backend's standard error body (README → API conventions → Errors). */
export interface ApiError {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  details: unknown[];
}

export function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ApiError).code === 'string' &&
    typeof (body as ApiError).message === 'string'
  );
}

/** A message a user can read: the API's own `message`, or a generic fallback. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (isApiError(error.error)) {
      return error.error.message;
    }
    if (error.status === 0) {
      return 'Cannot reach the server. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
