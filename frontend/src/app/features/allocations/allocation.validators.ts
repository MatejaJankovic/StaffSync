import { ValidatorFn } from '@angular/forms';

/** The shortest rejection comment (BR-6) or change reason (BR-15), as on the server. */
export const MIN_TEXT_LENGTH = 10;

/** The longest rejection comment or change reason, as on the server. */
export const MAX_TEXT_LENGTH = 1000;

/**
 * A rejection comment or change reason long enough for the server: counted without the surrounding
 * spaces, as there, so "  Too short " is too short. Gives `required` when there is no text and
 * `tooShort` under {@link MIN_TEXT_LENGTH}; pair it with `Validators.maxLength(MAX_TEXT_LENGTH)`.
 */
export const textLength: ValidatorFn = (control) => {
  const length = String(control.value ?? '').trim().length;
  if (length === 0) {
    return { required: true };
  }
  return length < MIN_TEXT_LENGTH ? { tooShort: true } : null;
};
