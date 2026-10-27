import { APIResponse, expect } from '@playwright/test';

/** The standard error body (spec §10): { timestamp, status, code, message, details }. */
export interface ApiError {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  details: { field: string; message: string }[];
}

/** Checks the HTTP status, the error format and the code, and returns the body for further checks. */
export async function expectError(response: APIResponse, status: number, code: string): Promise<ApiError> {
  expect(response.status()).toBe(status);
  const body: ApiError = await response.json();
  expect(body).toEqual({
    timestamp: expect.any(String),
    status,
    code,
    message: expect.any(String),
    details: expect.any(Array),
  });
  return body;
}

/** The names of the fields in a VALIDATION_ERROR, sorted. */
export function fieldsOf(error: ApiError): string[] {
  return error.details.map((detail) => detail.field).sort();
}
